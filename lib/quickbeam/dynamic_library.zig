const builtin = @import("builtin");
const std = @import("std");

const is_windows = builtin.os.tag == .windows;
const windows = std.os.windows;

const WindowsApi = if (is_windows) struct {
    extern "kernel32" fn LoadLibraryW(path: [*:0]const u16) callconv(.winapi) ?windows.HMODULE;
    extern "kernel32" fn GetProcAddress(module: windows.HMODULE, name: [*:0]const u8) callconv(.winapi) ?*anyopaque;
} else struct {};

pub const DynamicLibrary = struct {
    handle: Handle,

    const Handle = if (is_windows) windows.HMODULE else std.DynLib;

    pub fn open(allocator: std.mem.Allocator, path: [:0]const u8) !DynamicLibrary {
        if (is_windows) {
            const wide_path = try std.unicode.utf8ToUtf16LeAllocZ(allocator, path);
            defer allocator.free(wide_path);

            return .{
                .handle = WindowsApi.LoadLibraryW(wide_path.ptr) orelse return error.OpenFailed,
            };
        }

        return .{ .handle = try std.DynLib.openZ(path) };
    }

    pub fn lookup(self: *DynamicLibrary, comptime T: type, name: [:0]const u8) ?T {
        if (is_windows) {
            const address = WindowsApi.GetProcAddress(self.handle, name.ptr) orelse return null;
            return @ptrCast(address);
        }

        return self.handle.lookup(T, name);
    }
};
