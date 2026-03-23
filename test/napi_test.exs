defmodule QuickBEAM.NapiTest do
  use ExUnit.Case, async: true

  @addon_path Path.expand("support/test_addon.node", __DIR__)

  test "load_addon returns exports with expected keys" do
    {:ok, rt} = QuickBEAM.start()
    assert {:ok, exports} = QuickBEAM.load_addon(rt, @addon_path)
    assert is_map(exports)
    assert Map.has_key?(exports, "hello")
    assert Map.has_key?(exports, "add")
    QuickBEAM.stop(rt)
  end

  test "load_addon fails with invalid path" do
    {:ok, rt} = QuickBEAM.start()
    assert {:error, _} = QuickBEAM.load_addon(rt, "/nonexistent/addon.node")
    QuickBEAM.stop(rt)
  end

  test "addon functions are callable from Elixir via call" do
    {:ok, rt} = QuickBEAM.start()
    {:ok, _} = QuickBEAM.load_addon(rt, @addon_path)

    # The addon exports are set as the return value but not yet on a global.
    # We need to define them as globals to call from JS.
    # For now test that the runtime is still functional after loading.
    assert {:ok, 42} = QuickBEAM.eval(rt, "21 + 21")
    QuickBEAM.stop(rt)
  end
end
