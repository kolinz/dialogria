import { createServer } from "node:http";
import { Server } from "socket.io";
import { app, setRealtime } from "./app.js";
import { config } from "./config.js";
import { sessionUser, roomAccess } from "./access.js";
export function createRealtimeServer() {
    const server = createServer(app), io = new Server(server, {
        cors: { origin: config.WEB_ORIGIN, credentials: true },
    });
    io.use((socket, next) => {
        const cookie = socket.request.headers.cookie
            ?.split(";")
            .map((v) => v.trim())
            .find((v) => v.startsWith("sid="))
            ?.slice(4);
        const u = sessionUser(cookie ? decodeURIComponent(cookie) : undefined);
        if (!u || socket.handshake.auth.csrf !== u.csrf)
            return next(new Error("UNAUTHENTICATED"));
        socket.data.userId = u.id;
        socket.data.cookie = cookie;
        next();
    });
    io.on("connection", (socket) => {
        socket.on("room:join", (rid, ack) => {
            try {
                if (typeof rid !== "string")
                    throw new Error();
                roomAccess(rid, socket.data.userId);
                void socket.join(rid);
                ack?.({ ok: true });
            }
            catch {
                ack?.({ error: "FORBIDDEN" });
            }
        });
    });
    setRealtime((rid, m) => {
        for (const socket of io.sockets.sockets.values())
            if (socket.rooms.has(rid)) {
                try {
                    if (!sessionUser(socket.data.cookie))
                        throw new Error();
                    roomAccess(rid, socket.data.userId);
                    socket.emit("message:committed", m);
                }
                catch {
                    void socket.leave(rid);
                    socket.emit("room:revoked", rid);
                }
            }
    }, (rid, uid) => {
        for (const socket of io.sockets.sockets.values())
            if (socket.rooms.has(rid) && (!uid || socket.data.userId === uid)) {
                void socket.leave(rid);
                socket.emit("room:revoked", rid);
            }
    });
    return { server, io };
}
