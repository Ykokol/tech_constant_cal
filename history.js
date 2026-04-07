document.addEventListener('DOMContentLoaded', () => {
    
    const cuttingContainer = document.getElementById('cuttingHistoryContainer');
    const epContainer = document.getElementById('epHistoryContainer');

    function loadAndRenderHistory() {
        const historyStr = localStorage.getItem('calc_history');
        if (!historyStr) return;

        const history = JSON.parse(historyStr);

        // 渲染样品切割历史
        if (history.sampleCutting && history.sampleCutting.length > 0) {
            cuttingContainer.innerHTML = ''; 
            history.sampleCutting.forEach(record => {
                const card = document.createElement('div');
                card.className = 'history-card';
                card.innerHTML = `
                    <button class="delete-btn" onclick="deleteRecord('sampleCutting', ${record.id})">删除</button>
                    <div class="history-date">计算时间: ${record.date}</div>
                    <div class="history-inputs">
                        <strong>输入参数:</strong> <br>
                        料厚 ${record.inputs.stockThickness} mm | 
                        样品 ${record.inputs.sampleW_mm} x ${record.inputs.sampleH_mm} x ${record.inputs.sampleThickness} mm
                    </div>
                    <div class="result" style="margin-top: 15px; background-color: #1a1a1a; padding: 15px; border-radius: 6px; border: 1px solid #333;">
                        ${record.instructionHTML}
                    </div>
                    ${record.thumbnail ? `<img src="${record.thumbnail}" alt="切割方案图">` : ''}
                `;
                cuttingContainer.appendChild(card);
            });
        } else {
            cuttingContainer.innerHTML = '<p style="color: #aaa;">暂无切割历史...</p>';
        }

        // 渲染EP计算历史
        if (history.epCathode && history.epCathode.length > 0) {
            epContainer.innerHTML = ''; 
            history.epCathode.forEach(record => {
                const card = document.createElement('div');
                card.className = 'history-card';
                card.style.borderLeftColor = '#2196F3'; 
                
                let sampleListStr = record.inputs.sampleData.map(s => 
                    `[${s.l}x${s.w}x${s.t}mm - ${s.qty}个]`
                ).join(', ');

                // 兼容舊資料，如果舊資料沒有厚度，則顯示為 0
                let thicknessStr = record.inputs.cathodeThickness !== undefined ? record.inputs.cathodeThickness : 0;

                card.innerHTML = `
                    <button class="delete-btn" onclick="deleteRecord('epCathode', ${record.id})">删除</button>
                    <div class="history-date">计算时间: ${record.date}</div>
                    <div class="history-inputs">
                        <strong>输入极板尺寸:</strong> 长 ${record.inputs.cathodeLength} mm x 厚 ${thicknessStr} mm <br>
                        <strong>使用样品组合:</strong> ${sampleListStr}
                    </div>
                    <div class="result" style="margin-top: 15px; background-color: #1a1a1a; padding: 15px; border-radius: 6px; border: 1px solid #333;">
                        ${record.instructionHTML}
                    </div>
                `;
                epContainer.appendChild(card);
            });
        } else {
            epContainer.innerHTML = '<p style="color: #aaa;">暂无EP计算历史...</p>';
        }
    }

    window.deleteRecord = function(type, id) {
        if (!confirm('确定要删除这条历史记录吗？')) return;
        let history = JSON.parse(localStorage.getItem('calc_history'));
        if (history && history[type]) {
            history[type] = history[type].filter(record => record.id !== id);
            localStorage.setItem('calc_history', JSON.stringify(history));
            loadAndRenderHistory();
        }
    };

    loadAndRenderHistory();
});