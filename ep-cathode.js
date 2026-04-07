document.addEventListener('DOMContentLoaded', () => {
    
    let devConfig = { cathodeRatio: 10 }; 

    function loadDevConfig() {
        const configStr = localStorage.getItem('default');
        if (configStr) {
            const config = JSON.parse(configStr);
            if (config.cathodeRatio) {
                devConfig.cathodeRatio = parseFloat(config.cathodeRatio);
            }
        }
    }
    loadDevConfig();

    const sampleList = document.getElementById('sampleList');
    const addSampleBtn = document.getElementById('addSampleBtn');
    const calculateEpBtn = document.getElementById('calculateEpBtn');
    const epResult = document.getElementById('epResult');

    let sampleCount = 0;

    function addSampleRow(l=20, w=10, t=1, qty=1) {
        sampleCount++;
        const rowId = `sample-row-${sampleCount}`;
        
        const rowDiv = document.createElement('div');
        rowDiv.className = 'form-group';
        rowDiv.id = rowId;
        rowDiv.style.border = '1px dashed #ccc';
        rowDiv.style.padding = '10px';
        rowDiv.style.marginBottom = '10px';
        rowDiv.style.position = 'relative';

        rowDiv.innerHTML = `
            <h4 style="margin-top: 0;">样品组 ${sampleCount}</h4>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <div style="flex: 1;">
                    <label>长 (mm)</label>
                    <input type="number" class="sample-l" value="${l}" step="1" min="0">
                </div>
                <div style="flex: 1;">
                    <label>宽 (mm)</label>
                    <input type="number" class="sample-w" value="${w}" step="1" min="0">
                </div>
                <div style="flex: 1;">
                    <label>厚 (mm)</label>
                    <input type="number" class="sample-t" value="${t}" step="0.1" min="0">
                </div>
                <div style="flex: 1;">
                    <label>数量 (个)</label>
                    <input type="number" class="sample-qty" value="${qty}" step="1" min="1">
                </div>
            </div>
            <button class="btn btn-secondary" onclick="removeSampleRow('${rowId}')" style="margin-top: 10px; background-color: #ff4c4c;">删除此组</button>
        `;
        sampleList.appendChild(rowDiv);
    }

    window.removeSampleRow = function(rowId) {
        const row = document.getElementById(rowId);
        if (row) row.remove();
    };

    addSampleRow();
    addSampleBtn.addEventListener('click', () => addSampleRow());

    function saveToHistory(record) {
        let history = JSON.parse(localStorage.getItem('calc_history')) || { sampleCutting: [], epCathode: [] };
        if (!history.epCathode) history.epCathode = [];
        history.epCathode.unshift(record); 
        if (history.epCathode.length > 10) history.epCathode = history.epCathode.slice(0, 10);
        try {
            localStorage.setItem('calc_history', JSON.stringify(history));
        } catch(e) {
            console.warn('存储空间不足', e);
            history.epCathode.pop();
            localStorage.setItem('calc_history', JSON.stringify(history));
        }
    }

    calculateEpBtn.addEventListener('click', () => {
        loadDevConfig(); 

        const cathodeLength = parseFloat(document.getElementById('cathodeLength').value);
        const cathodeThickness = parseFloat(document.getElementById('cathodeThickness').value);

        if (isNaN(cathodeLength) || cathodeLength <= 0 || isNaN(cathodeThickness) || cathodeThickness < 0) {
            alert('请输入有效的阴极极板尺寸！'); return;
        }

        let totalAnodeArea = 0;
        const rows = sampleList.querySelectorAll('div[id^="sample-row-"]');
        if (rows.length === 0) { alert('请至少添加一组样品！'); return; }

        let sampleData = [];

        rows.forEach(row => {
            const l = parseFloat(row.querySelector('.sample-l').value) || 0;
            const w = parseFloat(row.querySelector('.sample-w').value) || 0;
            const t = parseFloat(row.querySelector('.sample-t').value) || 0;
            const qty = parseFloat(row.querySelector('.sample-qty').value) || 0;
            
            sampleData.push({l, w, t, qty});
            const singleSurfaceArea = 2 * (l * w + l * t + w * t);
            totalAnodeArea += singleSurfaceArea * qty;
        });

        if (totalAnodeArea === 0) {
            epResult.innerHTML = `<p style="color: red;">样品总面积为 0，请检查输入参数。</p>`; return;
        }

        const targetCathodeArea = totalAnodeArea * devConfig.cathodeRatio;
        
        // --- 核心：包含厚度的立體表面積逆推 ---
        // 浸入的表面積 = 2*(長*寬度) + 2*(厚*寬度) + (長*厚)  => [這裡的寬度W即為要求的暴露深度]
        // 也就是: Area = 2*L*W + 2*T*W + L*T
        // 推導 W = (Area - L*T) / (2*(L + T))
        const bottomArea = cathodeLength * cathodeThickness;
        let requiredExposedWidth = (targetCathodeArea - bottomArea) / (2 * (cathodeLength + cathodeThickness));

        let alertHtml = '';
        if (requiredExposedWidth <= 0) {
            requiredExposedWidth = 0;
            alertHtml = `<p style="color: #ff9800; font-weight: bold;">⚠ 极板的底面积已超出或等于所需总面积，仅需使其表面刚好接触液面即可。</p>`;
        }

        epResult.innerHTML = `
            <p><strong>当前阴阳极面积比 (全局):</strong> ${devConfig.cathodeRatio} : 1</p>
            <hr>
            <p><strong>阳极(样品)总表面积:</strong> ${totalAnodeArea.toFixed(2)} mm²</p>
            <p><strong>所需阴极总表面积:</strong> ${targetCathodeArea.toFixed(2)} mm²</p>
            ${alertHtml}
            <p style="font-size: 1.2em; color: #4caf50; margin-top: 15px;">
                <strong>▶ 建议极板浸入(暴露)深度:</strong> 
                <span style="font-size: 1.5em; border-bottom: 2px solid currentColor;">${requiredExposedWidth.toFixed(2)} mm</span>
            </p>
            <p class="instructions" style="margin-top: 10px;">* 计算说明：面积已包含正反两面(2LW)、两侧边(2TW)以及极板底面(LT)。</p>
        `;

        saveToHistory({
            id: Date.now(),
            date: new Date().toLocaleString(),
            inputs: { cathodeLength, cathodeThickness, sampleData },
            settings: { cathodeRatio: devConfig.cathodeRatio },
            results: { totalAnodeArea, targetCathodeArea, requiredExposedWidth },
            instructionHTML: epResult.innerHTML
        });
    });
});