defmodule QuickBEAM.NodeChildProcess do
  @moduledoc false

  @default_max_buffer 1_048_576

  @spec exec_sync(list()) :: map()
  def exec_sync([command, opts]) when is_binary(command) do
    opts = if is_map(opts), do: opts, else: %{}
    cwd = Map.get(opts, "cwd")
    timeout = Map.get(opts, "timeout")
    encoding = Map.get(opts, "encoding")
    max_buffer = Map.get(opts, "maxBuffer", @default_max_buffer)

    cmd_opts = [:binary, :exit_status, :stderr_to_stdout]
    cmd_opts = if cwd, do: [{:cd, cwd} | cmd_opts], else: cmd_opts

    run = fn ->
      {executable, args} = shell_command(command)

      port =
        Port.open(
          {:spawn_executable, String.to_charlist(executable)},
          [{:args, Enum.map(args, &String.to_charlist/1)} | cmd_opts]
        )

      collect_output(port, <<>>, max_buffer)
    end

    {stdout, status} =
      if timeout do
        task = Task.async(fn -> run.() end)

        case Task.yield(task, timeout) || Task.shutdown(task, :brutal_kill) do
          {:ok, result} -> result
          nil -> {"", :timeout}
        end
      else
        run.()
      end

    if status == :timeout do
      %{"stdout" => "", "status" => nil, "error" => "ETIMEDOUT"}
    else
      stdout = if encoding == "buffer", do: {:bytes, stdout}, else: stdout
      %{"stdout" => stdout, "status" => status}
    end
  end

  @spec exec_sync([String.t()]) :: map()
  def exec_sync([command]) when is_binary(command) do
    exec_sync([command, %{}])
  end

  defp collect_output(port, acc, max_buffer) do
    receive do
      {^port, {:data, data}} ->
        acc = <<acc::binary, data::binary>>

        acc =
          if byte_size(acc) > max_buffer,
            do: binary_part(acc, 0, max_buffer),
            else: acc

        collect_output(port, acc, max_buffer)

      {^port, {:exit_status, status}} ->
        {acc, status}
    end
  end

  defp shell_command(command) do
    case :os.type() do
      {:win32, _name} ->
        {System.find_executable("cmd.exe") || "cmd.exe", ["/d", "/s", "/c", command]}

      _unix ->
        {System.find_executable("sh") || "/bin/sh", ["-c", command]}
    end
  end
end
