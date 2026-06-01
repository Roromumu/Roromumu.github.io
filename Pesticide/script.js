// ════════════════════════════════════════════════════════
// 取得頁面上各元素的參考
// ════════════════════════════════════════════════════════
const video = document.getElementById('camera');
const analyzeBtn = document.getElementById('analyzeBtn');
const stopBtn = document.getElementById('stopBtn');
const result = document.getElementById('result');
const redBox1 = document.getElementById('redBox1');
const redBox2 = document.getElementById('redBox2');
const analyzingOverlay = document.getElementById('analyzingOverlay');

// ════════════════════════════════════════════════════════
// 全域變數
// ════════════════════════════════════════════════════════
let stream;            // 攝像頭串流物件
let interval;          // setInterval 的 ID，用於停止計時
let logRGBValues = []; // 每次取樣的完整 RGB 紀錄陣列

// 紅框在畫面上的座標（螢幕 px），計算時再換算到攝像頭真實解析度
let redBoxPositions = {
    redBox1: { left: 0, top: 0 },
    redBox2: { left: 0, top: 0 },
};

// ════════════════════════════════════════════════════════
// 兩階段計時參數（可調整）
// 第一階段：等待兩組各自偵測到反應起點，最多等 WAIT_LIMIT 秒
// 第二階段：偵測到起點後，各組獨立再跑 REACTION_DURATION 秒
// ════════════════════════════════════════════════════════
const WAIT_LIMIT = 180;        // 第一階段上限（秒）
const REACTION_DURATION = 120; // 第二階段計時長度（秒）

// ════════════════════════════════════════════════════════
// 反應起點偵測閾值（可調整）
// 版本A：固定閾值，slope 超過此值視為反應開始
// 版本B：相對閾值，slope 超過「初始B值 x 比例」視為反應開始
// 兩版本都計算，最終以版本B為主要輸出
// ════════════════════════════════════════════════════════
const REACTION_FIXED_THRESHOLD = 0.5;           // 版本A 固定閾值
const REACTION_RELATIVE_THRESHOLD_RATIO = 0.01; // 版本B 相對比例（1%）
const REACTION_CONFIRM_COUNT = 3;               // 連續幾筆超過閾值才確認起點


// ════════════════════════════════════════════════════════
// startCamera()
// 啟動裝置後鏡頭，將畫面輸出到 video 元素
// ════════════════════════════════════════════════════════
async function startCamera() {
    video.setAttribute('playsinline', true);
    video.setAttribute('webkit-playsinline', true);

    try {
        const constraints = {
            video: { facingMode: 'environment' } // 優先使用後鏡頭
        };
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("瀏覽器不支持 getUserMedia");
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            // 動態設定 aspect-ratio，配合攝像頭實際輸出比例，消除黑邊
            video.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        };
        analyzeBtn.disabled = false;
        stopBtn.disabled = true;
    } catch (err) {
        console.error("無法啟動攝像頭: ", err);
        result.innerHTML = `錯誤：無法啟動攝像頭。請檢查瀏覽器權限設置或設備支持性。${err.message}`;
        analyzeBtn.disabled = true;
    }
}


// ════════════════════════════════════════════════════════
// makeDraggable(box)
// 讓紅框可以用滑鼠或手指拖曳，並限制在攝像頭畫面範圍內
// ════════════════════════════════════════════════════════
function makeDraggable(box) {
    let offsetX = 0, offsetY = 0, isDragging = false;

    // 記錄拖曳起始時的偏移量
    function startDragging(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const parentRect = box.offsetParent.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();
        offsetX = clientX - boxRect.left;
        offsetY = clientY - boxRect.top;
        e.preventDefault();
        e.stopPropagation();
        document.body.style.cursor = 'grabbing';
    }

    // 拖曳移動時，計算新位置並限制在攝像頭畫面範圍內
    function moveDragging(e) {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const parent = box.offsetParent;
        const camera = document.getElementById('camera');
        const parentRect = parent.getBoundingClientRect();
        const cameraRect = camera.getBoundingClientRect();
        const cameraOffsetLeft = cameraRect.left - parentRect.left;
        const cameraOffsetTop = cameraRect.top - parentRect.top;
        const boxWidth = box.offsetWidth;
        const boxHeight = box.offsetHeight;
        const rawLeft = clientX - parentRect.left - offsetX;
        const rawTop = clientY - parentRect.top - offsetY;
        // 限制紅框不超出攝像頭畫面邊界
        const minLeft = cameraOffsetLeft;
        const maxLeft = cameraOffsetLeft + camera.offsetWidth - boxWidth;
        const minTop = cameraOffsetTop;
        const maxTop = cameraOffsetTop + camera.offsetHeight - boxHeight;
        const newLeft = Math.max(minLeft, Math.min(rawLeft, maxLeft));
        const newTop = Math.max(minTop, Math.min(rawTop, maxTop));
        box.style.left = `${newLeft}px`;
        box.style.top = `${newTop}px`;
        // 同步更新紅框座標記錄
        redBoxPositions[box.id] = { left: newLeft, top: newTop };
    }

    function stopDragging() {
        isDragging = false;
        document.body.style.cursor = 'default';
    }

    box.addEventListener('mousedown', startDragging);
    box.addEventListener('touchstart', startDragging);
    document.addEventListener('mousemove', moveDragging);
    document.addEventListener('touchmove', moveDragging, { passive: false });
    document.addEventListener('mouseup', stopDragging);
    document.addEventListener('touchend', stopDragging);
}


// ════════════════════════════════════════════════════════
// getAverageColor(box)
// 擷取紅框區域的像素資料，計算並回傳 RGB 平均值
// 需要將螢幕座標換算為攝像頭真實解析度座標
//
// 注意：CSS 使用 object-fit: cover，畫面會被裁切以填滿容器
// 因此換算時需要額外計算裁切偏移量（cropOffsetX / cropOffsetY）
// 才能正確對應到攝像頭實際像素位置
// ════════════════════════════════════════════════════════
function getAverageColor(box) {
    // 建立隱形 canvas，解析度與攝像頭原始解析度相同
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    // 將當前攝像頭畫面截圖到 canvas（完整原始解析度）
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 取得攝像頭在螢幕上的顯示尺寸
    const videoRect = video.getBoundingClientRect();
    const displayW = videoRect.width;
    const displayH = videoRect.height;

    // 計算 object-fit: cover 的縮放比例
    // cover 會選擇「讓畫面完全覆蓋容器」的比例，也就是取較大的那個縮放值
    const scaleX = video.videoWidth  / displayW;
    const scaleY = video.videoHeight / displayH;
    const scale  = Math.min(scaleX, scaleY); // cover 用較小的縮放比（畫面放大到剛好覆蓋）

    // 計算畫面被裁切的偏移量（cover 會讓畫面居中，多餘的部分裁掉）
    // cropOffsetX：左右各裁掉多少像素（原始解析度）
    // cropOffsetY：上下各裁掉多少像素（原始解析度）
    const cropOffsetX = (video.videoWidth  - displayW * scale) / 2;
    const cropOffsetY = (video.videoHeight - displayH * scale) / 2;

    // 取得紅框在螢幕上的座標與尺寸
    const boxLeft   = redBoxPositions[box.id].left;
    const boxTop    = redBoxPositions[box.id].top;
    const boxWidth  = box.offsetWidth;
    const boxHeight = box.offsetHeight;

    // 換算為攝像頭真實解析度座標（加上裁切偏移）
    const boxX = boxLeft  * scale + cropOffsetX;
    const boxY = boxTop   * scale + cropOffsetY;
    const boxW = boxWidth  * scale;
    const boxH = boxHeight * scale;

    // 確保不超出 canvas 邊界
    const safeX = Math.max(0, Math.min(boxX, canvas.width  - boxW));
    const safeY = Math.max(0, Math.min(boxY, canvas.height - boxH));
    const safeY = Math.max(0, Math.min(boxY, canvas.height - boxH));

    // 取得紅框區域所有像素資料（格式：[R,G,B,A, R,G,B,A, ...]）
    const imageData = ctx.getImageData(safeX, safeY, boxW, boxH).data;

    // 累加所有像素的 RGB 值後取平均
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];     // Red
        g += imageData[i + 1]; // Green
        b += imageData[i + 2]; // Blue
        // imageData[i+3] 是 Alpha（透明度），不使用
        count++;
    }
    return { r: r / count, g: g / count, b: b / count };
}


// ════════════════════════════════════════════════════════
// removeOutliers(values, count)
// 將陣列排序後，去除最小的 count 筆與最大的 count 筆
// 用於消除極端值對統計結果的影響
// ════════════════════════════════════════════════════════
function removeOutliers(values, count = 3) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.slice(count, sorted.length - count);
}


// ════════════════════════════════════════════════════════
// calculateQuartiles(values)
// 計算陣列的 Q1（下四分位數）與 Q2（中位數）
// 先去除極端值再計算，提高穩定性
// ════════════════════════════════════════════════════════
function calculateQuartiles(values) {
    values = values.filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) return { q1: "N/A", q2: "N/A" };
    const trimmed = removeOutliers(values, 3);
    if (trimmed.length === 0) return { q1: "N/A", q2: "N/A" };
    const median = arr => {
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
    };
    const q2Raw = median(trimmed);
    const lowerHalf = trimmed.slice(0, Math.floor(trimmed.length / 2));
    const q1Raw = median(lowerHalf);
    return {
        q1: q1Raw.toFixed(5),
        q2: q2Raw.toFixed(5)
    };
}


// ════════════════════════════════════════════════════════
// findReactionStartIndex(slopes, useRelative, initialB)
// 在 slope 陣列中找到「反應開始」的位置
// 條件：連續 REACTION_CONFIRM_COUNT 筆 slope 超過閾值
//
// useRelative = false → 版本A 固定閾值
// useRelative = true  → 版本B 相對閾值（初始B值 × 比例）
//
// 回傳起點 index；找不到則回傳 -1（表示未偵測到）
// ════════════════════════════════════════════════════════
function findReactionStartIndex(slopes, useRelative, initialB) {
    const threshold = useRelative
        ? initialB * REACTION_RELATIVE_THRESHOLD_RATIO // 版本B：相對閾值
        : REACTION_FIXED_THRESHOLD;                    // 版本A：固定閾值

    let consecutiveCount = 0; // 連續超過閾值的筆數

    for (let i = 0; i < slopes.length; i++) {
        if (slopes[i] > threshold) {
            consecutiveCount++;
            if (consecutiveCount >= REACTION_CONFIRM_COUNT) {
                return i - REACTION_CONFIRM_COUNT + 1; // 回傳起點位置
            }
        } else {
            consecutiveCount = 0; // 中斷連續，重置計數
        }
    }
    return -1; // 未找到反應起點
}


// ════════════════════════════════════════════════════════
// movingAverage(values, windowSize)
// 對陣列做滑動平均以平滑雜訊
// 每 windowSize 筆取一個平均值，向後滑動
// ════════════════════════════════════════════════════════
function movingAverage(values, windowSize = 5) {
    const result = [];
    for (let i = 0; i <= values.length - windowSize; i++) {
        const window = values.slice(i, i + windowSize);
        const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
        result.push(avg);
    }
    return result;
}


// ════════════════════════════════════════════════════════
// calculatePercentageReduction(b1Stats, b2Stats)
// 根據空白組（b1）與樣品組（b2）的 Q1、Q2 計算農藥抑制率
// 公式：抑制率 = (1 - 樣品組斜率 / 空白組斜率) × 100%
// 取 Q1 和 Q2 各算一次後取平均，減少單一統計量的誤差
// ════════════════════════════════════════════════════════
function calculatePercentageReduction(b1Stats, b2Stats) {
    // 安全計算抑制率，避免除以零
    function safePercent(qB1, qB2) {
        const n1 = parseFloat(qB1);
        const n2 = parseFloat(qB2);
        if (n1 === 0) return null;
        return (1 - (n2 / n1)) * 100;
    }
    const q1Raw = safePercent(b1Stats.q1, b2Stats.q1); // 用 Q1 算
    const q2Raw = safePercent(b1Stats.q2, b2Stats.q2); // 用 Q2 算
    // 取兩者平均作為最終抑制率
    const avg = (q1Raw != null && q2Raw != null)
        ? ((q1Raw + q2Raw) / 2).toFixed(2) + "%"
        : "N/A";
    return {
        q1Percent: q1Raw != null ? q1Raw.toFixed(2) + "%" : "N/A",
        q2Percent: q2Raw != null ? q2Raw.toFixed(2) + "%" : "N/A",
        average: avg
    };
}


// ════════════════════════════════════════════════════════
// updateRedBoxPositions()
// 重新計算兩個紅框相對於攝像頭畫面的位置，存到 redBoxPositions
// 在開始分析前呼叫，確保座標是最新的
// ════════════════════════════════════════════════════════
function updateRedBoxPositions() {
    const parentRect = video.getBoundingClientRect();
    ['redBox1', 'redBox2'].forEach(id => {
        const box = document.getElementById(id);
        const rect = box.getBoundingClientRect();
        redBoxPositions[id] = {
            left: rect.left - parentRect.left,
            top: rect.top - parentRect.top
        };
    });
}


// ════════════════════════════════════════════════════════
// calculateHeadTailRate(bStart, bEnd)
// 版本C：頭尾B值法
// 直接用「反應開始B值」與「反應結束B值」計算抑制率
// 公式：抑制率 = (1 - 樣品組B值變化量 / 空白組B值變化量) × 100%
// B值變化量 = 起點B值 - 終點B值（正值代表B值下降，即反應發生）
// ════════════════════════════════════════════════════════
function calculateHeadTailRate(b1Start, b1End, b2Start, b2End) {
    const delta1 = b1Start - b1End; // 空白組 B 值變化量
    const delta2 = b2Start - b2End; // 樣品組 B 值變化量

    if (delta1 === 0) return "N/A"; // 空白組無變化，無法計算

    const rate = (1 - delta2 / delta1) * 100;
    return rate.toFixed(2) + "%";
}


// ════════════════════════════════════════════════════════
// showQuartiles()
// 分析結束後計算所有版本抑制率並跳轉到結果頁
//
// 版本A：固定閾值偵測起點 + 取後 REACTION_DURATION 秒 + 四分位數
// 版本B：相對閾值偵測起點 + 取後 REACTION_DURATION 秒 + 四分位數（主要）
// 版本C：頭尾B值法，直接用起點與終點B值計算（最簡單）
// 原始版本：不裁切全部資料 + 四分位數（供比對）
// ════════════════════════════════════════════════════════
function showQuartiles() {
    // 過濾掉沒有 slope 或值為 NaN 的紀錄（第一筆沒有 slope）
    const validData = logRGBValues.filter(entry =>
        entry.slope &&
        !isNaN(parseFloat(entry.slope.b1)) &&
        !isNaN(parseFloat(entry.slope.b2))
    );

    // 取出所有時間點的 B 值斜率（每 2 秒的 B 值變化量）
    const rawB1 = validData.map(entry => parseFloat(entry.slope.b1)); // 空白組
    const rawB2 = validData.map(entry => parseFloat(entry.slope.b2)); // 樣品組

    // 取初始 B 值，供版本B相對閾值使用
    const initialB1 = validData.length > 0 ? parseFloat(validData[0].color1.b) : 200;
    const initialB2 = validData.length > 0 ? parseFloat(validData[0].color2.b) : 200;

    // REACTION_DURATION 秒對應的取樣筆數（每筆 = 2 秒）
    const samplesPerDuration = Math.floor(REACTION_DURATION / 2);

    // ── 版本A：固定閾值，空白組與樣品組各自獨立偵測起點 ──
    const startA_b1 = findReactionStartIndex(rawB1, false, initialB1); // 空白組起點
    const startA_b2 = findReactionStartIndex(rawB2, false, initialB2); // 樣品組起點
    const idxA_b1 = startA_b1 >= 0 ? startA_b1 : 0;
    const idxA_b2 = startA_b2 >= 0 ? startA_b2 : 0;
    const trimA_b1 = rawB1.slice(idxA_b1, idxA_b1 + samplesPerDuration);
    const trimA_b2 = rawB2.slice(idxA_b2, idxA_b2 + samplesPerDuration);

    // ── 版本B：相對閾值，空白組與樣品組各自獨立偵測起點 ──
    const startB_b1 = findReactionStartIndex(rawB1, true, initialB1); // 空白組起點
    const startB_b2 = findReactionStartIndex(rawB2, true, initialB2); // 樣品組起點
    const idxB_b1 = startB_b1 >= 0 ? startB_b1 : 0;
    const idxB_b2 = startB_b2 >= 0 ? startB_b2 : 0;
    const trimB_b1 = rawB1.slice(idxB_b1, idxB_b1 + samplesPerDuration);
    const trimB_b2 = rawB2.slice(idxB_b2, idxB_b2 + samplesPerDuration);

    // ── 版本C：頭尾B值法 ──
    // 取各組在偵測到起點時的B值（起點），以及最後一筆B值（終點）
    // 使用版本B的起點index對應到 logRGBValues 中的實際B值
    const allData = logRGBValues.filter(e => e.color1 && e.color2); // 含第一筆
    const b1StartVal = allData.length > 0
        ? parseFloat(allData[idxB_b1]?.color1?.b ?? allData[0].color1.b)
        : 0;
    const b2StartVal = allData.length > 0
        ? parseFloat(allData[idxB_b2]?.color2?.b ?? allData[0].color2.b)
        : 0;
    const b1EndVal = allData.length > 0
        ? parseFloat(allData[allData.length - 1].color1.b)
        : 0;
    const b2EndVal = allData.length > 0
        ? parseFloat(allData[allData.length - 1].color2.b)
        : 0;
    const rateC = calculateHeadTailRate(b1StartVal, b1EndVal, b2StartVal, b2EndVal);

    // ── 原始版本（全部資料不裁切，供比對用）──
    const b1Smoothed  = movingAverage(rawB1, 5);
    const b2Smoothed  = movingAverage(rawB2, 5);

    // ── 版本A 滑動平均 ──
    const b1SmoothedA = movingAverage(trimA_b1, 5);
    const b2SmoothedA = movingAverage(trimA_b2, 5);

    // ── 版本B 滑動平均 ──
    const b1SmoothedB = movingAverage(trimB_b1, 5);
    const b2SmoothedB = movingAverage(trimB_b2, 5);

    // 各版本計算四分位數
    const b1Stats  = calculateQuartiles(b1Smoothed);
    const b2Stats  = calculateQuartiles(b2Smoothed);
    const b1StatsA = calculateQuartiles(b1SmoothedA);
    const b2StatsA = calculateQuartiles(b2SmoothedA);
    const b1StatsB = calculateQuartiles(b1SmoothedB);
    const b2StatsB = calculateQuartiles(b2SmoothedB);

    // 各版本計算抑制率
    const percentReduction  = calculatePercentageReduction(b1Stats,  b2Stats);  // 原始
    const percentReductionA = calculatePercentageReduction(b1StatsA, b2StatsA); // 版本A
    const percentReductionB = calculatePercentageReduction(b1StatsB, b2StatsB); // 版本B（主要）

    // 版本B 為主要輸出結果，存入 localStorage 後跳轉結果頁
    localStorage.setItem("rate", percentReductionB.average);

    // 其餘版本與除錯資訊存入 localStorage 供比對
    localStorage.setItem("rate_original",              percentReduction.average);
    localStorage.setItem("rate_fixedThreshold",        percentReductionA.average);
    localStorage.setItem("rate_headtail",              rateC);                    // 版本C 頭尾法
    localStorage.setItem("headtail_b1_start",          b1StartVal.toFixed(3));   // 空白組起點B值
    localStorage.setItem("headtail_b1_end",            b1EndVal.toFixed(3));     // 空白組終點B值
    localStorage.setItem("headtail_b2_start",          b2StartVal.toFixed(3));   // 樣品組起點B值
    localStorage.setItem("headtail_b2_end",            b2EndVal.toFixed(3));     // 樣品組終點B值
    localStorage.setItem("reaction_start_b1_fixed",    startA_b1); // 版本A 空白組起點 index
    localStorage.setItem("reaction_start_b2_fixed",    startA_b2); // 版本A 樣品組起點 index
    localStorage.setItem("reaction_start_b1_relative", startB_b1); // 版本B 空白組起點 index
    localStorage.setItem("reaction_start_b2_relative", startB_b2); // 版本B 樣品組起點 index

    // 將完整 RGB 原始紀錄序列化後存入 localStorage，供結算頁匯出 Excel 使用
    localStorage.setItem("logRGBValues", JSON.stringify(logRGBValues));

    location.href = "ResultsV2.html"; // 跳轉到詳細結算頁
}


// ════════════════════════════════════════════════════════
// analyzeBtn 點擊事件
// 開始兩階段分析流程：
//
// 第一階段（等待期）：
//   每 2 秒取樣一次，同時對空白組/樣品組各自偵測反應起點
//   兩組獨立，誰先偵測到誰先進入第二階段
//
// 第二階段（計時期）：
//   各組各自倒數 REACTION_DURATION 秒
//   兩組都跑完才結算
//
// 超時處理：
//   等待超過 WAIT_LIMIT 秒仍有任一組未偵測到 → 顯示警告並強制結算
// ════════════════════════════════════════════════════════
analyzeBtn.addEventListener('click', async function () {
    updateRedBoxPositions(); // 確保紅框座標是最新的

    logRGBValues = [];           // 清空上一次的紀錄
    let waitCount = WAIT_LIMIT;  // 第一階段剩餘等待秒數

    // 各組獨立的第二階段狀態
    // started: 是否已偵測到起點
    // countdown: 第二階段剩餘秒數
    let b1Phase = { started: false, countdown: REACTION_DURATION }; // 空白組
    let b2Phase = { started: false, countdown: REACTION_DURATION }; // 樣品組

    stopBtn.disabled = false;
    analyzeBtn.disabled = true;
    analyzingOverlay.style.display = 'flex'; // 顯示分析中提示條

    // 第一筆資料：立刻取樣（無 slope，因為沒有前一筆可比較）
    const color1 = getAverageColor(redBox1);
    const color2 = getAverageColor(redBox2);
    logRGBValues.push({
        time: waitCount,
        color1: { r: color1.r.toFixed(3), g: color1.g.toFixed(3), b: color1.b.toFixed(3) },
        color2: { r: color2.r.toFixed(3), g: color2.g.toFixed(3), b: color2.b.toFixed(3) },
        slope: null // 第一筆沒有斜率
    });

    result.innerHTML = `
        等待反應中… (最多剩 ${waitCount} 秒)<br>
        空白組 RGB: (${color1.r.toFixed(3)}, ${color1.g.toFixed(3)}, ${color1.b.toFixed(3)})<br>
        樣品組 RGB: (${color2.r.toFixed(3)}, ${color2.g.toFixed(3)}, ${color2.b.toFixed(3)})<br>
    `;

    waitCount -= 2; // 第一筆算 2 秒

    // 每 2 秒執行一次取樣與狀態判斷
    interval = setInterval(() => {
        // 取得當前幀的 RGB 平均值
        const color1 = getAverageColor(redBox1);
        const color2 = getAverageColor(redBox2);

        // 計算與上一筆的 B 值差（斜率）
        const prev = logRGBValues[logRGBValues.length - 1];
        const slope = {
            b1: (parseFloat(prev.color1.b) - color1.b).toFixed(3), // 空白組 B 值變化量
            b2: (parseFloat(prev.color2.b) - color2.b).toFixed(3)  // 樣品組 B 值變化量
        };

        // 紀錄本筆資料
        logRGBValues.push({
            time: waitCount,
            color1: { r: color1.r.toFixed(3), g: color1.g.toFixed(3), b: color1.b.toFixed(3) },
            color2: { r: color2.r.toFixed(3), g: color2.g.toFixed(3), b: color2.b.toFixed(3) },
            slope
        });

        // 取出目前所有有效 slope 供起點偵測使用
        const currentSlopes1 = logRGBValues
            .filter(e => e.slope && !isNaN(parseFloat(e.slope.b1)))
            .map(e => parseFloat(e.slope.b1)); // 空白組 slope 陣列
        const currentSlopes2 = logRGBValues
            .filter(e => e.slope && !isNaN(parseFloat(e.slope.b2)))
            .map(e => parseFloat(e.slope.b2)); // 樣品組 slope 陣列

        // 取初始 B 值供版本B相對閾值計算
        const initB1 = parseFloat(logRGBValues[0].color1.b);
        const initB2 = parseFloat(logRGBValues[0].color2.b);

        // 空白組：若尚未偵測到起點，嘗試用版本B偵測
        if (!b1Phase.started) {
            const idx = findReactionStartIndex(currentSlopes1, true, initB1);
            if (idx >= 0) {
                b1Phase.started = true;                // 空白組偵測到起點
                b1Phase.countdown = REACTION_DURATION; // 重設倒數
            }
        }

        // 樣品組：若尚未偵測到起點，嘗試用版本B偵測
        if (!b2Phase.started) {
            const idx = findReactionStartIndex(currentSlopes2, true, initB2);
            if (idx >= 0) {
                b2Phase.started = true;                // 樣品組偵測到起點
                b2Phase.countdown = REACTION_DURATION; // 重設倒數
            }
        }

        // 已進入第二階段的組別各自倒數
        if (b1Phase.started) b1Phase.countdown -= 2; // 空白組倒數
        if (b2Phase.started) b2Phase.countdown -= 2; // 樣品組倒數

        // 判斷結束條件：兩組都完成倒數
        const bothDone = b1Phase.started && b2Phase.started &&
                         b1Phase.countdown <= 0 && b2Phase.countdown <= 0;

        // 判斷超時條件：等待超過上限，仍有任一組未偵測到起點
        const timeout = waitCount < 0 && (!b1Phase.started || !b2Phase.started);

        if (bothDone || timeout) {
            // 停止計時，恢復按鈕狀態
            clearInterval(interval);
            analyzeBtn.disabled = false;
            stopBtn.disabled = true;
            toggleTorch(false);
            analyzingOverlay.style.display = 'none';

            // 若超時，顯示哪組沒偵測到的警告訊息
            if (timeout) {
                const missing = [];
                if (!b1Phase.started) missing.push('空白組');
                if (!b2Phase.started) missing.push('樣品組');
                result.innerHTML += `<br><span style="color:red;">⚠️ ${missing.join('、')} 未偵測到明顯反應起點，以現有資料強制結算</span>`;
            }

            showQuartiles();
            return;
        }

        // 更新畫面顯示：各組分別顯示目前狀態
        const b1Label = b1Phase.started
            ? `空白組計時中: ${b1Phase.countdown} 秒`
            : `空白組等待反應…`;
        const b2Label = b2Phase.started
            ? `樣品組計時中: ${b2Phase.countdown} 秒`
            : `樣品組等待反應…`;
        const waitLabel = (!b1Phase.started || !b2Phase.started)
            ? `(等待上限剩 ${waitCount} 秒)` : '';

        result.innerHTML = `
            ${b1Label}<br>
            ${b2Label}<br>
            ${waitLabel}<br>
            空白組 RGB: (${color1.r.toFixed(3)}, ${color1.g.toFixed(3)}, ${color1.b.toFixed(3)})<br>
            樣品組 RGB: (${color2.r.toFixed(3)}, ${color2.g.toFixed(3)}, ${color2.b.toFixed(3)})<br>
        `;

        waitCount -= 2; // 每次減 2 秒

    }, 2000);
});


// ════════════════════════════════════════════════════════
// toggleTorch(on)
// 控制手機手電筒開關（部分裝置支援）
// ════════════════════════════════════════════════════════
function toggleTorch(on) {
    try {
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        if (capabilities.torch) {
            track.applyConstraints({ advanced: [{ torch: on }] });
        }
    } catch (err) {
        console.error("無法控制手電筒: ", err);
    }
}


// ════════════════════════════════════════════════════════
// 頁面初始化
// ════════════════════════════════════════════════════════
startCamera();          // 啟動攝像頭
makeDraggable(redBox1); // 讓空白組紅框可拖曳
makeDraggable(redBox2); // 讓樣品組紅框可拖曳

//20250514
// 光源訊號確認按鈕：重新啟動攝像頭並即時顯示兩組 RGB 值，供使用者確認光源是否正常
document.getElementById('startBtn').addEventListener('click', async () => {
    await startCamera();
    // 攝像頭畫面載入後更新紅框位置並即時顯示 RGB
    video.onloadeddata = () => {
        updateRedBoxPositions();
        const color1 = getAverageColor(redBox1);
        const color2 = getAverageColor(redBox2);
        result.innerHTML = `
            空白組 RGB: (${color1.r.toFixed(3)}, ${color1.g.toFixed(3)}, ${color1.b.toFixed(3)})<br>
            樣品組 RGB: (${color2.r.toFixed(3)}, ${color2.g.toFixed(3)}, ${color2.b.toFixed(3)})<br>
        `;
    };
});
//20250514
