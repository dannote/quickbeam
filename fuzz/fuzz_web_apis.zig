const std = @import("std");
const qjs = @cImport(@cInclude("quickjs.h"));

const gpa = std.heap.c_allocator;

fn eval_with_globals(code: []const u8) void {
    const rt = qjs.JS_NewRuntime() orelse return;
    defer qjs.JS_FreeRuntime(rt);

    qjs.JS_SetMemoryLimit(rt, 8 * 1024 * 1024);
    qjs.JS_SetMaxStackSize(rt, 256 * 1024);

    const ctx = qjs.JS_NewContext(rt) orelse return;
    defer qjs.JS_FreeContext(ctx);

    // Install TextEncoder/TextDecoder would require importing our modules.
    // Instead, fuzz the built-in APIs that QuickJS provides.
    const src = gpa.dupeZ(u8, code) catch return;
    defer gpa.free(src);

    const val = qjs.JS_Eval(ctx, src.ptr, src.len, "<fuzz>", qjs.JS_EVAL_TYPE_GLOBAL);
    if (val.tag != qjs.JS_TAG_EXCEPTION) {
        qjs.JS_FreeValue(ctx, val);
    } else {
        const exc = qjs.JS_GetException(ctx);
        qjs.JS_FreeValue(ctx, exc);
    }

    while (true) {
        var pctx: ?*qjs.JSContext = null;
        if (qjs.JS_ExecutePendingJob(rt, &pctx) <= 0) break;
    }
}

fn fuzz_one(_: void, input: []const u8) anyerror!void {
    // Prefix fuzz input with various API calls to exercise more code paths
    const prefixes = [_][]const u8{
        "new Uint8Array([",
        "JSON.parse('",
        "new ArrayBuffer(",
        "Promise.resolve(",
        "new Map([[",
        "",
    };

    inline for (prefixes) |prefix| {
        const combined = gpa.alloc(u8, prefix.len + input.len + 2) catch return;
        defer gpa.free(combined);
        @memcpy(combined[0..prefix.len], prefix);
        @memcpy(combined[prefix.len .. prefix.len + input.len], input);
        combined[prefix.len + input.len] = ')';
        combined[prefix.len + input.len + 1] = 0;
        eval_with_globals(combined[0 .. prefix.len + input.len + 1]);
    }
}

test "fuzz web APIs" {
    try std.testing.fuzz({}, fuzz_one, .{});
}

test "fuzz web APIs - sanity" {
    try fuzz_one({}, "1,2,3])");
    try fuzz_one({}, "{}')");
    try fuzz_one({}, "16)");
    try fuzz_one({}, "42)");
    try fuzz_one({}, "'a', 1]])");
}
