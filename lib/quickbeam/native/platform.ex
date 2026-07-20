defmodule QuickBEAM.Native.Platform do
  @moduledoc false

  defstruct [:family, :lexbor_port, :wamr_platform]

  @type family :: :linux | :macos | :windows
  @type os_type :: {:unix | :win32, atom()}
  @type t :: %__MODULE__{
          family: family(),
          lexbor_port: String.t(),
          wamr_platform: String.t()
        }

  @spec current() :: t()
  def current, do: from_os_type(:os.type())

  @spec from_os_type(os_type()) :: t()
  def from_os_type({:win32, _name}) do
    %__MODULE__{family: :windows, lexbor_port: "windows_nt", wamr_platform: "windows"}
  end

  def from_os_type({:unix, :darwin}) do
    %__MODULE__{family: :macos, lexbor_port: "posix", wamr_platform: "darwin"}
  end

  def from_os_type({:unix, _name}) do
    %__MODULE__{family: :linux, lexbor_port: "posix", wamr_platform: "linux"}
  end

  @spec lexbor_cflags(t()) :: [String.t()]
  def lexbor_cflags(%__MODULE__{family: :windows}), do: ["-D_CRT_SECURE_NO_WARNINGS"]
  def lexbor_cflags(%__MODULE__{}), do: []

  @spec wamr_cflags(t()) :: [String.t()]
  def wamr_cflags(%__MODULE__{family: :windows}) do
    [
      "-DBH_PLATFORM_WINDOWS",
      "-DWASM_DISABLE_HW_BOUND_CHECK=1",
      "-DHAVE_STRUCT_TIMESPEC",
      "-D_WINSOCK_DEPRECATED_NO_WARNINGS"
    ]
  end

  def wamr_cflags(%__MODULE__{}), do: ["-D_GNU_SOURCE"]

  @spec quickjs_cflags(t()) :: [String.t()]
  def quickjs_cflags(%__MODULE__{family: :windows}), do: []
  def quickjs_cflags(%__MODULE__{}), do: ["-D_GNU_SOURCE"]

  @spec wamr_sources(t()) :: [String.t()]
  def wamr_sources(%__MODULE__{family: :windows}) do
    Path.wildcard("priv/c_src/wamr/shared/platform/windows/*.c")
    |> Enum.reject(&String.ends_with?(&1, "/win_file.c"))
  end

  def wamr_sources(%__MODULE__{wamr_platform: platform}) do
    ~w(
      priv/c_src/wamr/shared/platform/common/posix/posix_malloc.c
      priv/c_src/wamr/shared/platform/common/posix/posix_memmap.c
      priv/c_src/wamr/shared/platform/common/posix/posix_thread.c
      priv/c_src/wamr/shared/platform/common/posix/posix_time.c
      priv/c_src/wamr/shared/platform/common/posix/posix_blocking_op.c
    ) ++ ["priv/c_src/wamr/shared/platform/#{platform}/platform_init.c"]
  end

  @spec include_dirs(t()) :: [{:priv, String.t()}]
  def include_dirs(%__MODULE__{} = platform) do
    [
      {:priv, "c_src"},
      {:priv, "c_src/lexbor/ports/#{platform.lexbor_port}"},
      {:priv, "c_src/wamr/include"},
      {:priv, "c_src/wamr/interpreter"},
      {:priv, "c_src/wamr/common"},
      {:priv, "c_src/wamr/shared/utils"},
      {:priv, "c_src/wamr/shared/platform/include"},
      {:priv, "c_src/wamr/shared/platform/#{platform.wamr_platform}"},
      {:priv, "c_src/wamr/shared/mem-alloc"}
    ]
  end

  @spec link_libraries(t()) :: [{:system, String.t()}]
  def link_libraries(%__MODULE__{family: :windows}), do: [{:system, "ws2_32"}]
  def link_libraries(%__MODULE__{}), do: []
end
