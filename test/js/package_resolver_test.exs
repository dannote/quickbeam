defmodule QuickBEAM.JS.PackageResolverTest do
  use ExUnit.Case, async: true

  alias QuickBEAM.JS.PackageResolver

  test "stops at the filesystem root when node_modules is absent" do
    root =
      Path.join(System.tmp_dir!(), "quickbeam-resolver-#{System.unique_integer([:positive])}")

    nested = Path.join([root, "one", "two"])
    File.mkdir_p!(nested)
    on_exit(fn -> File.rm_rf!(root) end)

    assert PackageResolver.find_node_modules(nested) == nil
  end
end
