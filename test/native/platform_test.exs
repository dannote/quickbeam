defmodule QuickBEAM.Native.PlatformTest do
  use ExUnit.Case, async: true

  alias QuickBEAM.Native.Platform

  test "configures Linux native sources and flags" do
    platform = Platform.from_os_type({:unix, :linux})

    assert platform.family == :linux
    assert platform.lexbor_port == "posix"
    assert platform.wamr_platform == "linux"
    assert Platform.lexbor_cflags(platform) == []
    assert Platform.wamr_cflags(platform) == ["-D_GNU_SOURCE"]
    assert Platform.quickjs_cflags(platform) == ["-D_GNU_SOURCE"]
    assert Platform.link_libraries(platform) == []

    assert "priv/c_src/wamr/shared/platform/linux/platform_init.c" in Platform.wamr_sources(
             platform
           )
  end

  test "configures macOS native sources and flags" do
    platform = Platform.from_os_type({:unix, :darwin})

    assert platform.family == :macos
    assert platform.lexbor_port == "posix"
    assert platform.wamr_platform == "darwin"
    assert Platform.wamr_cflags(platform) == ["-D_GNU_SOURCE"]

    assert "priv/c_src/wamr/shared/platform/darwin/platform_init.c" in Platform.wamr_sources(
             platform
           )
  end

  test "configures Windows native sources, flags, and libraries" do
    platform = Platform.from_os_type({:win32, :nt})
    sources = Platform.wamr_sources(platform)

    assert platform.family == :windows
    assert platform.lexbor_port == "windows_nt"
    assert platform.wamr_platform == "windows"
    assert Platform.lexbor_cflags(platform) == ["-D_CRT_SECURE_NO_WARNINGS"]
    assert "-DBH_PLATFORM_WINDOWS" in Platform.wamr_cflags(platform)
    assert Platform.quickjs_cflags(platform) == []
    assert Platform.link_libraries(platform) == [{:system, "ws2_32"}]
    assert Enum.any?(sources, &String.ends_with?(&1, "/win_thread.c"))
    refute Enum.any?(sources, &String.ends_with?(&1, "/win_file.c"))
  end

  test "include directories follow the selected ports" do
    windows_dirs = Platform.from_os_type({:win32, :nt}) |> Platform.include_dirs()
    linux_dirs = Platform.from_os_type({:unix, :linux}) |> Platform.include_dirs()

    assert {:priv, "c_src/lexbor/ports/windows_nt"} in windows_dirs
    assert {:priv, "c_src/wamr/shared/platform/windows"} in windows_dirs
    assert {:priv, "c_src/lexbor/ports/posix"} in linux_dirs
    assert {:priv, "c_src/wamr/shared/platform/linux"} in linux_dirs
  end
end
