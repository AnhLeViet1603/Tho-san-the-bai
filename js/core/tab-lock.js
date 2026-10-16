// Chỉ một tab được ghi dữ liệu: giữ Web Lock suốt thời gian chạy, tab khác muốn dùng thì xin nhường qua BroadcastChannel.
// Mỗi tab giữ một bản DB riêng trong bộ nhớ và ghi đè cả file vào IndexedDB, nên hai tab cùng ghi sẽ làm mất dữ liệu của nhau.
(function (T) {
  'use strict';

  const NAME = 'tstb-writer';

  // env: { locks, Channel, stealAfter } — mặc định lấy từ trình duyệt; test truyền bản giả
  function create(env = {}) {
    const locks = 'locks' in env ? env.locks : (window.navigator && window.navigator.locks);
    const Channel = 'Channel' in env ? env.Channel : window.BroadcastChannel;
    const stealAfter = env.stealAfter != null ? env.stealAfter : 3000;

    let release = null; // resolve để nhả lock; null khi không giữ
    let onLost = null;  // gọi khi tab khác lấy quyền ghi: onLost({ stolen })
    let channel = null;

    function post(msg) {
      if (!Channel) return;
      const ch = new Channel(NAME);
      ch.postMessage(msg);
      ch.close();
    }

    function listen() {
      if (channel || !Channel) return;
      channel = new Channel(NAME);
      channel.onmessage = async e => {
        if (e.data !== 'takeover' || !release) return;
        const done = release;
        release = null;
        try {
          if (onLost) await onLost({ stolen: false });
        } finally {
          done();
        }
      };
    }

    // Giữ lock cho tới khi release() được gọi
    function hold() {
      listen();
      return new Promise(r => { release = r; });
    }

    // Lock bị tab khác cướp (steal): không kịp ghi nốt, chỉ dừng ghi
    function lost() {
      if (!release) return;
      release = null;
      if (onLost) onLost({ stolen: true });
    }

    // true nếu tab này giành được quyền ghi. Trình duyệt không có Web Locks thì luôn cho ghi.
    function acquire(lostCb) {
      onLost = lostCb || null;
      if (!locks) return Promise.resolve(true);
      return new Promise(resolve => {
        locks.request(NAME, { ifAvailable: true }, lock => {
          if (!lock) return resolve(false);
          resolve(true);
          return hold();
        }).catch(err => {
          if (release) lost();
          else { console.error(err); resolve(true); }
        });
      });
    }

    // Xin tab đang giữ nhường quyền ghi (nó sẽ lưu nốt rồi nhả lock).
    // Nếu sau stealAfter ms vẫn chưa nhả (tab treo), cướp lock.
    function takeover(lostCb) {
      onLost = lostCb || null;
      if (!locks) return Promise.resolve();
      return new Promise(resolve => {
        const ctrl = new AbortController();
        let got = false;
        const grab = () => { got = true; resolve(); return hold(); };
        const onErr = err => {
          if (release) lost();
          else if (err.name !== 'AbortError') console.error(err);
        };
        locks.request(NAME, { signal: ctrl.signal }, grab).catch(onErr);
        post('takeover');
        setTimeout(() => {
          if (got) return;
          ctrl.abort();
          locks.request(NAME, { steal: true }, grab).catch(onErr);
        }, stealAfter);
      });
    }

    const owns = () => !!release;

    // Nhả lock và ngừng nghe (dùng cho test)
    function close() {
      if (release) { release(); release = null; }
      if (channel) { channel.close(); channel = null; }
    }

    return { acquire, takeover, owns, close };
  }

  T.tabLock = Object.assign(create(), { create });
})(window.TSTB);
