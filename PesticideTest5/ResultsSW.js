const circumference = 2 * Math.PI * 50; // r=50 for smaller circles

const ratesRaw = localStorage.getItem("rates");
const errorCode = localStorage.getItem("errorCode") || "正常";
const grid = document.getElementById("samplesGrid");

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

    // Parse and animate
    let percent = parseFloat(rateStr);

    if (rateStr === null || rateStr === undefined || rateStr === 'N/A') {
        percentText.textContent = '無資料';
        fgCircle.style.stroke = '#ccc';
        statusText.textContent = '未接收到資料';
        statusText.style.color = '#999';
    } else if (percent < -10 || percent > 100) {
        percentText.textContent = '異常';
        fgCircle.style.stroke = '#ccc';
        statusText.textContent = '請檢查數據';
        statusText.style.color = '#999';
    } else {
        if (percent < 0 && percent >= -10) percent = 0;
        const { label, color } = getLabel(percent);
        fgCircle.style.stroke = color;
        statusText.textContent = label;
        statusText.style.color = color;

        let current = 0;
        const steps = 60;
        const stepSize = percent / steps;
        const stepTime = 1000 / steps;

        const anim = setInterval(() => {
            current += stepSize;
            if (current >= percent) {
                current = percent;
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

    // Show error codes if any
    if (errorCode && errorCode !== "正常") {
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'grid-column:span 2;text-align:center;color:#e63946;font-size:13px;font-weight:bold;padding:8px;background:#ffe0e0;border-radius:8px;margin-top:4px;';
        errDiv.textContent = errorCode;
        grid.appendChild(errDiv);
    }
}
