const circumference = 2 * Math.PI * 50;

const ratesRaw = localStorage.getItem("rates");
const errorCode = localStorage.getItem("errorCode") || "正常";
const grid = document.getElementById("samplesGrid");

// ── Debug 顯示區 ──
const debugDiv = document.createElement('div');
debugDiv.style.cssText = 'background:#333;color:#0f0;font-size:11px;padding:8px;margin:8px;border-radius:6px;word-break:break-all;white-space:pre-wrap;';
debugDiv.textContent = `rates: ${ratesRaw}\nerrorCode: ${errorCode}`;
document.body.insertBefore(debugDiv, document.body.firstChild);

function getLabel(percent) {
    if (percent <= 35) return { label: '合格', color: 'green' };
    if (percent <= 45) return { label: '有點危險', color: 'orange' };
    return { label: '不合格', color: 'red' };
}

function createCard(index, rateStr) {
    const card = document.createElement('div');
    card.className = 'sample-card';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `樣品 A${index + 1}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'circle-wrapper';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 110 110');

    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '55'); bgCircle.setAttribute('cy', '55');
    bgCircle.setAttribute('r', '50');
    bgCircle.style.cssText = 'fill:none;stroke:#eee;stroke-width:10';

    const fgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fgCircle.setAttribute('cx', '55'); fgCircle.setAttribute('cy', '55');
    fgCircle.setAttribute('r', '50');
    fgCircle.style.cssText = `fill:none;stroke-width:10;stroke-linecap:round;stroke-dasharray:${circumference};stroke-dashoffset:${circumference};transition:stroke-dashoffset 0.5s linear`;

    const percentText = document.createElement('div');
    percentText.className = 'percent-text';

    const statusText = document.createElement('div');
    statusText.className = 'status';

    svg.appendChild(bgCircle);
    svg.appendChild(fgCircle);
    wrapper.appendChild(svg);
    wrapper.appendChild(percentText);
    card.appendChild(title);
    card.appendChild(wrapper);
    card.appendChild(statusText);

    const percent = parseFloat(rateStr);
    const isNA = (rateStr === 'N/A' || rateStr === null || rateStr === undefined || isNaN(percent));

    if (isNA) {
        percentText.textContent = 'N/A';
        fgCircle.style.stroke = '#ccc';
        statusText.textContent = '數據異常';
        statusText.style.color = '#999';
    } else if (percent < -10 || percent > 100) {
        percentText.textContent = '異常';
        fgCircle.style.stroke = '#ccc';
        statusText.textContent = '請檢查數據';
        statusText.style.color = '#999';
    } else {
        const displayPercent = percent < 0 ? 0 : percent;
        const { label, color } = getLabel(displayPercent);
        fgCircle.style.stroke = color;
        statusText.textContent = label;
        statusText.style.color = color;

        let current = 0;
        const steps = 60;
        const stepSize = displayPercent / steps;
        const stepTime = 1000 / steps;

        const anim = setInterval(() => {
            current += stepSize;
            if (current >= displayPercent) {
                current = displayPercent;
                clearInterval(anim);
            }
            const offset = circumference - (current / 100) * circumference;
            fgCircle.style.strokeDashoffset = offset;
            percentText.textContent = current.toFixed(1) + '%';
        }, stepTime);
    }

    return card;
}

if (!ratesRaw) {
    grid.innerHTML = '<p style="text-align:center;color:#999;grid-column:span 2;">未接收到資料</p>';
} else {
    localStorage.removeItem("rates");
    localStorage.removeItem("errorCode");

    const rates = JSON.parse(ratesRaw);
    rates.forEach((rate, i) => {
        grid.appendChild(createCard(i, rate));
    });

    if (errorCode && errorCode !== "正常") {
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'grid-column:span 2;text-align:center;color:#e63946;font-size:13px;font-weight:bold;padding:8px;background:#ffe0e0;border-radius:8px;margin-top:4px;';
        errDiv.textContent = errorCode;
        grid.appendChild(errDiv);
    }
}
