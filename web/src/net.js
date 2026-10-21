// The browser-to-browser link for online play, using PeerJS (src/vendor/,
// MIT license). PeerJS's free public server only introduces the two
// browsers; the game messages then go directly between them over WebRTC,
// or through PeerJS's relay server if a firewall blocks the direct route.

const PEER_ID_PREFIX = "cognition-vs-diy-battleship-";
const CONNECT_TIMEOUT_MS = 20000;

let loading = null;

// Loaded only when someone picks online play, so playing the computer never
// depends on it.
function loadPeer() {
  if (window.peerjs) return Promise.resolve(window.peerjs.Peer);
  if (loading === null) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("./vendor/peerjs.min.js", import.meta.url).href;
      script.onload = () => resolve(window.peerjs.Peer);
      script.onerror = () => {
        loading = null;
        script.remove();
        reject(new Error("Couldn't load the online-play code. Check your internet connection."));
      };
      document.head.append(script);
    });
  }
  return loading;
}

function explain(error, code) {
  switch (error?.type) {
    case "peer-unavailable":
      return `No game found with code ${code}. Check the code, and that your friend's page is still open.`;
    case "browser-incompatible":
      return "This browser can't play online. Try an up-to-date Chrome, Edge, Firefox or Safari.";
    case "network":
    case "server-error":
    case "socket-error":
    case "socket-closed":
      return "Couldn't reach the online-play server. Check your internet connection, or your network may block it.";
    default:
      return error?.message || "Something went wrong with the connection.";
  }
}

// A link between two browsers. `events` gets onCode, onConnected, onMessage,
// onClosed and onError; each fires only while this link is the live one.
class Link {
  constructor(events) {
    this.events = events;
    this.peer = null;
    this.conn = null;
    this.timer = null;
    this.closed = false;
  }

  send(message) {
    if (this.conn?.open) this.conn.send(message);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    if (this.conn?.open) this.conn.send({ type: "leave" });
    // Give the goodbye a moment to go out before tearing down.
    const { peer, conn } = this;
    setTimeout(() => {
      conn?.close();
      peer?.destroy();
    }, 100);
  }

  fail(message) {
    if (this.closed) return;
    this.close();
    this.events.onError(message);
  }

  #watch(conn) {
    this.conn = conn;
    conn.on("open", () => {
      if (this.closed) return;
      clearTimeout(this.timer);
      this.events.onConnected();
    });
    conn.on("data", (message) => {
      if (!this.closed) this.events.onMessage(message);
    });
    conn.on("close", () => {
      if (this.closed) return;
      this.closed = true;
      this.peer?.destroy();
      this.events.onClosed();
    });
    conn.on("error", (error) => this.fail(explain(error)));
  }

  async host(makeCode, attempts = 3) {
    const Peer = await loadPeer();
    if (this.closed) return;
    const code = makeCode();
    const peer = new Peer(PEER_ID_PREFIX + code);
    this.peer = peer;
    peer.on("open", () => {
      if (!this.closed) this.events.onCode(code);
    });
    peer.on("connection", (conn) => {
      // Only one friend per game; anyone else who uses the code is turned away.
      if (this.closed || this.conn !== null) {
        conn.on("open", () => conn.close());
        return;
      }
      this.#watch(conn);
    });
    peer.on("error", (error) => {
      if (this.closed || this.peer !== peer) return;
      if (error.type === "unavailable-id" && attempts > 1) {
        peer.destroy();
        this.host(makeCode, attempts - 1).catch((e) => this.fail(e.message));
        return;
      }
      // Once the game is under way, losing the matchmaking server doesn't matter.
      if (this.conn?.open) return;
      this.fail(explain(error, code));
    });
  }

  async join(code) {
    const Peer = await loadPeer();
    if (this.closed) return;
    const peer = new Peer();
    this.peer = peer;
    this.timer = setTimeout(
      () =>
        this.fail(
          "Couldn't connect to your friend. A firewall on one of your networks may be blocking online play.",
        ),
      CONNECT_TIMEOUT_MS,
    );
    peer.on("open", () => {
      if (this.closed) return;
      this.#watch(peer.connect(PEER_ID_PREFIX + code, { reliable: true, serialization: "json" }));
    });
    peer.on("error", (error) => {
      if (this.closed || this.conn?.open) return;
      this.fail(explain(error, code));
    });
  }
}

export function hostGame(makeCode, events) {
  const link = new Link(events);
  link.host(makeCode).catch((error) => link.fail(error.message));
  return link;
}

export function joinGame(code, events) {
  const link = new Link(events);
  link.join(code).catch((error) => link.fail(error.message));
  return link;
}
