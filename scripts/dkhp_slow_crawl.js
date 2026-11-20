/*
 * Quét CHẬM danh sách lớp học phần của dkhp.uel.edu.vn bằng phiên đăng nhập sẵn có của bạn.
 * Token chỉ được đọc trong trang, KHÔNG in ra, KHÔNG gửi đi đâu khác.
 *
 * Cách dùng (Claude in Chrome: dùng công cụ javascript_tool; hoặc DevTools Console):
 *  1) Mở https://dkhp.uel.edu.vn/Student/FilterScheduleUnit khi đã đăng nhập.
 *  2) Đặt hàng đợi:  window.__DKHP_QUEUE = [ ...các chuỗi trong data/dkhp_resume_state.json -> "queue" ... ];
 *  3) Dán toàn bộ file này. Theo dõi:  JSON.stringify({done:__dk2.done,total:__dk2.total,items:Object.keys(__dk2.items).length,errors:__dk2.errors})
 *  4) Dừng:  __dk2.stop = true.   Xuất kết quả: xem scripts/README hoặc docs/HANDOFF.md.
 *
 * Quy tắc an toàn (chủ dự án lo bị phát hiện): 1 luồng, nghỉ 1,5–3,5 s ngẫu nhiên, nghỉ thêm 15–25 s
 * sau mỗi 60 request, dừng ngay khi gặp 401/403/429 hoặc 3 lỗi liên tiếp. KHÔNG tăng tốc, KHÔNG chạy song song.
 * Chỉ gọi GetAllScheduleStudyUnit (chỉ đọc). Tuyệt đối không gọi API đăng ký/hủy học phần.
 */
(() => {
  const Q = window.__DKHP_QUEUE;
  if (!Array.isArray(Q) || !Q.length) throw new Error('Hãy đặt window.__DKHP_QUEUE trước.');
  window.__dk2 = { queue: [...Q], total: Q.length, items: {}, done: 0, errors: [], truncated: [], stop: false,
                   finished: false, t0: Date.now(), consecutiveErr: 0 };
  (async () => {
    const D = window.__dk2;
    const tok = JSON.parse(localStorage.getItem('authorizationData')).Token;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    while (!D.stop && D.queue.length) {
      const q = D.queue.shift();
      let arr = null;
      try {
        const r = await fetch('https://dkhpapi.uel.edu.vn/api/Schedule/GetAllScheduleStudyUnit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
          body: JSON.stringify({ ReqParam1: q, ReqParam2: '0' }),
        });
        if ([401, 403, 429].includes(r.status)) { D.stop = true; D.errors.push('STOP http ' + r.status + ' at ' + q); D.queue.unshift(q); break; }
        if (r.ok) { arr = await r.json(); D.consecutiveErr = 0; }
        else { D.errors.push(q + ' http ' + r.status); D.consecutiveErr++; }
      } catch (e) { D.errors.push(q + ' ' + e.message); D.consecutiveErr++; }
      if (D.consecutiveErr >= 3) { D.stop = true; D.errors.push('STOP 3 consecutive errors'); break; }
      if (Array.isArray(arr)) {
        for (const x of arr) D.items[x.ScheduleStudyUnitID] = x;
        if (arr.length >= 100) D.truncated.push(q);
      }
      D.done++;
      await sleep(1500 + Math.random() * 2000 + (D.done % 60 === 0 ? 15000 + Math.random() * 10000 : 0));
    }
    D.finished = true;
  })();
  return 'started slow crawl: ' + Q.length + ' queries';
})();
