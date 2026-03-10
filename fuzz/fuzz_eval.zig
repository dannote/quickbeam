const std = @import("std");
const qjs = @cImport(@cInclude("quickjs.h"));

const gpa = std.heap.c_allocator;

fn fuzz_one(_: void, input: []const u8) anyerror!void {
    const rt = qjs.JS_NewRuntime() orelse return;
    defer qjs.JS_FreeRuntime(rt);

    qjs.JS_SetMemoryLimit(rt, 8 * 1024 * 1024);
    qjs.JS_SetMaxStackSize(rt, 256 * 1024);

    const ctx = qjs.JS_NewContext(rt) orelse return;
    defer qjs.JS_FreeContext(ctx);

    // Null-terminate for QuickJS
    const code = gpa.dupeZ(u8, input) catch return;
    defer gpa.free(code);

    const val = qjs.JS_Eval(ctx, code.ptr, code.len, "<fuzz>", qjs.JS_EVAL_TYPE_GLOBAL);

    if (val.tag != qjs.JS_TAG_EXCEPTION) {
        qjs.JS_FreeValue(ctx, val);
    } else {
        const exc = qjs.JS_GetException(ctx);
        qjs.JS_FreeValue(ctx, exc);
    }

    // Drain pending jobs
    while (true) {
        var pctx: ?*qjs.JSContext = null;
        const ret = qjs.JS_ExecutePendingJob(rt, &pctx);
        if (ret <= 0) break;
    }
}

test "fuzz eval" {
    try std.testing.fuzz({}, fuzz_one, .{});
}

test "fuzz eval - sanity" {
    try fuzz_one({}, "1+1");
    try fuzz_one({}, "");
    try fuzz_one({}, "null");
    try fuzz_one({}, "throw new Error('test')");
    try fuzz_one({}, "({}).x.y");
}
