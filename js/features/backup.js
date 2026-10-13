// Xuất / nhập file .sqlite
(function (T) {
  'use strict';

  function exportFile() {
    const blob = new Blob([T.db.exportBytes()], { type: 'application/x-sqlite3' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tho-san-the-bai-${T.time.today()}.sqlite`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFile(file) {
    await T.db.importBytes(new Uint8Array(await file.arrayBuffer()));
  }

  T.backup = { exportFile, importFile };
})(window.TSTB);
