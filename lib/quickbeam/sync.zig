const std = @import("std");

const io = std.Io.Threaded.global_single_threaded.io();

pub fn nowNanoseconds() i128 {
    return std.Io.Timestamp.now(io, .awake).nanoseconds;
}

pub fn sleepNanoseconds(duration_ns: u64) void {
    const duration: std.Io.Clock.Duration = .{
        .clock = .awake,
        .raw = .fromNanoseconds(@intCast(duration_ns)),
    };

    duration.sleep(io) catch @panic("clock sleep failed");
}

pub fn fillRandom(buffer: []u8) bool {
    io.randomSecure(buffer) catch return false;
    return true;
}

pub fn realPathAlloc(allocator: std.mem.Allocator, path: []const u8) ![:0]u8 {
    return std.Io.Dir.cwd().realPathFileAlloc(io, path, allocator);
}

pub const Mutex = struct {
    inner: std.Io.Mutex = .init,

    pub fn lock(self: *Mutex) void {
        self.inner.lockUncancelable(io);
    }

    pub fn unlock(self: *Mutex) void {
        self.inner.unlock(io);
    }
};

pub const Condition = struct {
    inner: std.Io.Condition = .init,

    pub fn wait(self: *Condition, mutex: *Mutex) void {
        self.inner.waitUncancelable(io, &mutex.inner);
    }

    pub fn signal(self: *Condition) void {
        self.inner.signal(io);
    }

    pub fn broadcast(self: *Condition) void {
        self.inner.broadcast(io);
    }
};

pub const Event = struct {
    inner: std.Io.Event = .unset,

    pub fn isSet(self: *const Event) bool {
        return self.inner.isSet();
    }

    pub fn wait(self: *Event) void {
        self.inner.waitUncancelable(io);
    }

    pub fn timedWait(self: *Event, timeout_ns: u64) error{Timeout}!void {
        const timeout: std.Io.Timeout = .{
            .duration = .{
                .clock = .awake,
                .raw = .fromNanoseconds(@intCast(timeout_ns)),
            },
        };

        self.inner.waitTimeout(io, timeout) catch return error.Timeout;
    }

    pub fn set(self: *Event) void {
        self.inner.set(io);
    }

    pub fn reset(self: *Event) void {
        self.inner.reset();
    }
};
