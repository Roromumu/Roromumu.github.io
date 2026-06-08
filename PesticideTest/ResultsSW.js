const circle = document.getElementById('fgCircle');
const text = document.getElementById('percentText');
const status = document.getElementById('statusText');

const radius = 70;
const circumference = 2 * Math.PI * radius;

circle.style.strokeDasharray = circumference;
circle.style.strokeDashoffset = circumference;

const rateRaw = localStorage.getItem("rate");
let percent = parseFloat(rateRaw);

if (rateRaw === null) {
    // 沒有資料 → 不顯示動畫與數值，顯示錯誤提示
    document.getElementById("percentText").textContent = "無資料";
    document.getElementById("fgCircle").style.stroke = "#ccc";
    document.getElementById("statusText").textContent = "未接收到資料";
    document.getElementById("statusText").style.color = "#999";
} 
else if ( percent < -10 || percent > 100) {
    document.getElementById("percentText").textContent = "檢測率異常";
    document.getElementById("fgCircle").style.stroke = "#ccc";
    document.getElementById("statusText").textContent = "請檢查數據";
    document.getElementById("statusText").style.color = "#999";
    }
else 
{
    localStorage.removeItem("rate");
    
     if ( percent < 0 && percent >= -10 ) {
        percent = 0 ;
    }
    // 判斷等級與顏色
    let color = '';
    let label = '';

    if (percent <= 35) {
        color = 'green';
        label = '合格';
    } else if (percent <= 45) {
        color = 'orange';
        label = '有點危險';
    } else {
        color = 'red';
        label = '不合格';
    }

    const circle = document.getElementById('fgCircle');
    const text = document.getElementById('percentText');
    const status = document.getElementById('statusText');

    const radius = 70;
    const circumference = 2 * Math.PI * radius;

    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = circumference;
    circle.style.stroke = color;
    status.textContent = label;
    status.style.color = color;

    let current = 0;
    const duration = 1000;
    const steps = 60;
    const stepTime = duration / steps;
    const stepSize = percent / steps;

    const interval = setInterval(() => {
        current += stepSize;
        if (current >= percent) {
            current = percent;
            clearInterval(interval);
        }
        const offset = circumference - (current / 100) * circumference;
        circle.style.strokeDashoffset = offset;
        text.textContent = current.toFixed(2) + '%';
    }, stepTime);
}
