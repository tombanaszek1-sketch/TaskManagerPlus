using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using TaskManagerPlus.Core.Model;

namespace TaskManagerPlus.Core.Interop;

/// <summary>
/// Authenticode verification for both embedded signatures and catalog signatures
/// (most Windows system files are signed through catalogs, not in the file itself).
/// </summary>
internal static unsafe partial class WinTrust
{
    private static readonly Guid GenericVerifyV2 = new("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");
    private static readonly Guid DriverActionVerify = new("F750E6C3-38EE-11d1-85E5-00C04FC295EE");

    private const uint UiNone = 2;
    private const uint RevokeNone = 0;
    private const uint ChoiceFile = 1;
    private const uint ChoiceCatalog = 2;
    private const uint StateActionVerify = 1;
    private const uint StateActionClose = 2;
    private const uint CacheOnlyUrlRetrieval = 0x00001000;
    private const uint DisableMd2Md4 = 0x00002000;

    private const int TrustENoSignature = unchecked((int)0x800B0100);
    private const int TrustESubjectFormUnknown = unchecked((int)0x800B0003);
    private const int TrustEProviderUnknown = unchecked((int)0x800B0001);

    [StructLayout(LayoutKind.Sequential)]
    private struct FileInfo
    {
        public uint Size;
        public char* FilePath;
        public nint File;
        public Guid* KnownSubject;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct CatalogInfo
    {
        public uint Size;
        public uint CatalogVersion;
        public char* CatalogFilePath;
        public char* MemberTag;
        public char* MemberFilePath;
        public nint MemberFile;
        public byte* CalculatedFileHash;
        public uint CalculatedFileHashSize;
        public nint CatalogContext;
        public nint CatAdmin;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TrustData
    {
        public uint Size;
        public nint PolicyCallbackData;
        public nint SipClientData;
        public uint UiChoice;
        public uint RevocationChecks;
        public uint UnionChoice;
        public void* Info;
        public uint StateAction;
        public nint StateData;
        public char* UrlReference;
        public uint ProvFlags;
        public uint UiContext;
        public nint SignatureSettings;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct CatalogFileInfo
    {
        public uint Size;
        public fixed char CatalogFile[260];
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProviderSigner
    {
        public uint Size;
        public uint VerifyAsOfLow;
        public uint VerifyAsOfHigh;
        public uint CertChainCount;
        public ProviderCert* CertChain;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProviderCert
    {
        public uint Size;
        public nint Cert;
    }

    [LibraryImport("wintrust.dll")]
    private static partial int WinVerifyTrust(nint hwnd, in Guid action, TrustData* data);

    [LibraryImport("wintrust.dll")]
    private static partial nint WTHelperProvDataFromStateData(nint stateData);

    [LibraryImport("wintrust.dll")]
    private static partial ProviderSigner* WTHelperGetProvSignerFromChain(nint provData, uint signerIndex, [MarshalAs(UnmanagedType.Bool)] bool counterSigner, uint counterSignerIndex);

    [LibraryImport("wintrust.dll", StringMarshalling = StringMarshalling.Utf16)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CryptCATAdminAcquireContext2(out nint catAdmin, in Guid subsystem, string hashAlgorithm, nint strongHashPolicy, uint flags);

    [LibraryImport("wintrust.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CryptCATAdminReleaseContext(nint catAdmin, uint flags);

    [LibraryImport("wintrust.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CryptCATAdminCalcHashFromFileHandle2(nint catAdmin, nint file, ref uint hashSize, byte* hash, uint flags);

    [LibraryImport("wintrust.dll")]
    private static partial nint CryptCATAdminEnumCatalogFromHash(nint catAdmin, byte* hash, uint hashSize, uint flags, nint* previous);

    [LibraryImport("wintrust.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CryptCATCatalogInfoFromContext(nint catInfo, CatalogFileInfo* info, uint flags);

    [LibraryImport("wintrust.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CryptCATAdminReleaseCatalogContext(nint catAdmin, nint catInfo, uint flags);

    [LibraryImport("crypt32.dll", EntryPoint = "CertGetNameStringW")]
    private static partial uint CertGetNameString(nint cert, uint type, uint flags, nint typePara, char* name, uint size);

    public readonly record struct Result(SignatureState State, string? Signer);

    public static Result Verify(string path)
    {
        if (!File.Exists(path))
        {
            return new Result(SignatureState.Unknown, null);
        }

        var embedded = VerifyEmbedded(path);
        if (embedded.State == SignatureState.Valid)
        {
            return embedded;
        }

        var catalog = VerifyCatalog(path, "SHA256");
        if (catalog is null || catalog.Value.State != SignatureState.Valid)
        {
            catalog = VerifyCatalog(path, "SHA1") ?? catalog;
        }

        return catalog ?? embedded;
    }

    private static Result VerifyEmbedded(string path)
    {
        fixed (char* p = path)
        {
            var file = new FileInfo { Size = (uint)sizeof(FileInfo), FilePath = p };
            return Run(ChoiceFile, &file);
        }
    }

    private static Result? VerifyCatalog(string path, string algorithm)
    {
        if (!CryptCATAdminAcquireContext2(out var admin, DriverActionVerify, algorithm, 0, 0))
        {
            return null;
        }

        try
        {
            using SafeFileHandle handle = File.OpenHandle(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            uint hashSize = 64;
            var hash = stackalloc byte[64];
            if (!CryptCATAdminCalcHashFromFileHandle2(admin, handle.DangerousGetHandle(), ref hashSize, hash, 0))
            {
                return null;
            }

            var catalogContext = CryptCATAdminEnumCatalogFromHash(admin, hash, hashSize, 0, null);
            if (catalogContext == 0)
            {
                return null;
            }

            try
            {
                var catalogFile = new CatalogFileInfo { Size = (uint)sizeof(CatalogFileInfo) };
                if (!CryptCATCatalogInfoFromContext(catalogContext, &catalogFile, 0))
                {
                    return null;
                }

                var memberTag = Convert.ToHexString(new ReadOnlySpan<byte>(hash, (int)hashSize));
                fixed (char* member = path)
                fixed (char* tag = memberTag)
                {
                    var info = new CatalogInfo
                    {
                        Size = (uint)sizeof(CatalogInfo),
                        CatalogFilePath = catalogFile.CatalogFile,
                        MemberTag = tag,
                        MemberFilePath = member,
                        CalculatedFileHash = hash,
                        CalculatedFileHashSize = hashSize,
                        CatAdmin = admin,
                    };
                    return Run(ChoiceCatalog, &info);
                }
            }
            finally
            {
                CryptCATAdminReleaseCatalogContext(admin, catalogContext, 0);
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return null;
        }
        finally
        {
            CryptCATAdminReleaseContext(admin, 0);
        }
    }

    private static Result Run(uint choice, void* info)
    {
        var data = new TrustData
        {
            Size = (uint)sizeof(TrustData),
            UiChoice = UiNone,
            RevocationChecks = RevokeNone,
            UnionChoice = choice,
            Info = info,
            StateAction = StateActionVerify,
            ProvFlags = CacheOnlyUrlRetrieval | DisableMd2Md4,
        };

        var status = WinVerifyTrust(-1, GenericVerifyV2, &data);
        string? signer = null;
        try
        {
            if (status == 0)
            {
                signer = ReadSigner(data.StateData);
            }
        }
        finally
        {
            data.StateAction = StateActionClose;
            WinVerifyTrust(-1, GenericVerifyV2, &data);
        }

        var state = status switch
        {
            0 => SignatureState.Valid,
            TrustENoSignature or TrustESubjectFormUnknown or TrustEProviderUnknown => SignatureState.Unsigned,
            _ => SignatureState.Invalid,
        };
        return new Result(state, signer);
    }

    private static string? ReadSigner(nint stateData)
    {
        var provider = WTHelperProvDataFromStateData(stateData);
        if (provider == 0)
        {
            return null;
        }

        var signer = WTHelperGetProvSignerFromChain(provider, 0, false, 0);
        if (signer == null || signer->CertChainCount == 0 || signer->CertChain == null)
        {
            return null;
        }

        const uint simpleDisplayType = 4;
        var buffer = stackalloc char[256];
        var length = CertGetNameString(signer->CertChain[0].Cert, simpleDisplayType, 0, 0, buffer, 256);
        return length > 1 ? new string(buffer, 0, (int)length - 1) : null;
    }
}
