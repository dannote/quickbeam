const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const c_src = b.path("../priv/c_src");
    const c_flags = &.{"-std=c11"};
    const mod = b.createModule(.{
        .root_source_file = b.path("fuzz_eval.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });

    mod.addIncludePath(c_src);
    inline for (.{ "quickjs.c", "libregexp.c", "libunicode.c", "dtoa.c" }) |f| {
        mod.addCSourceFile(.{
            .file = c_src.path(b, f),
            .flags = c_flags,
        });
    }

    const fuzz_eval = b.addTest(.{ .root_module = mod });

    const mod_web = b.createModule(.{
        .root_source_file = b.path("fuzz_web_apis.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    mod_web.addIncludePath(c_src);
    inline for (.{ "quickjs.c", "libregexp.c", "libunicode.c", "dtoa.c" }) |f| {
        mod_web.addCSourceFile(.{
            .file = c_src.path(b, f),
            .flags = c_flags,
        });
    }
    const fuzz_web = b.addTest(.{ .root_module = mod_web });

    const run_fuzz_eval = b.addRunArtifact(fuzz_eval);
    const run_fuzz_web = b.addRunArtifact(fuzz_web);

    const fuzz_step = b.step("fuzz", "Run all fuzz tests");
    fuzz_step.dependOn(&run_fuzz_eval.step);
    fuzz_step.dependOn(&run_fuzz_web.step);

    const test_step = b.step("test", "Run fuzz sanity tests");
    test_step.dependOn(&run_fuzz_eval.step);
    test_step.dependOn(&run_fuzz_web.step);
}
