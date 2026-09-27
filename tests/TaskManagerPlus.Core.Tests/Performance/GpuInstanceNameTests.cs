using TaskManagerPlus.Core.Performance;

namespace TaskManagerPlus.Core.Tests.Performance;

public class GpuInstanceNameTests
{
    [Fact]
    public void Parses_engine_instance()
    {
        Assert.True(GpuInstanceName.TryParse("pid_1234_luid_0x00000000_0x0000EC5D_phys_0_eng_3_engtype_3D", out var name));

        Assert.Equal(1234, name.Pid);
        Assert.Equal("0x00000000_0x0000ec5d", name.Luid);
        Assert.Equal(3, name.Engine);
        Assert.Equal("3D", name.EngineType);
    }

    [Fact]
    public void Parses_process_memory_instance_without_engine()
    {
        Assert.True(GpuInstanceName.TryParse("pid_88_luid_0x00000000_0x0001A2B3_phys_0", out var name));

        Assert.Equal(88, name.Pid);
        Assert.Equal(-1, name.Engine);
        Assert.Equal(string.Empty, name.EngineType);
    }

    [Fact]
    public void Parses_adapter_instance_without_pid()
    {
        Assert.True(GpuInstanceName.TryParse("luid_0x00000000_0x0001A2B3_phys_0", out var name));

        Assert.Equal(-1, name.Pid);
        Assert.Equal("0x00000000_0x0001a2b3", name.Luid);
    }

    [Theory]
    [InlineData("")]
    [InlineData("_Total")]
    [InlineData("pid_x_luid_0x00000000_0x0001A2B3_phys_0")]
    [InlineData("pid_1_luid_0x0")]
    public void Rejects_malformed_names(string instance) =>
        Assert.False(GpuInstanceName.TryParse(instance, out _));

    [Theory]
    [InlineData("3D", "3D")]
    [InlineData("Compute_1", "Compute")]
    [InlineData("VideoDecode", "Video Decode")]
    [InlineData("Video Encode", "Video Encode")]
    [InlineData("Copy", "Copy")]
    [InlineData("Security", "Security")]
    [InlineData("", "Other")]
    public void Normalizes_engine_types(string raw, string expected) =>
        Assert.Equal(expected, GpuInstanceName.NormalizeEngineType(raw));
}
