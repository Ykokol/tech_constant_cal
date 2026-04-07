
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素获取 ---
    const imageInput = document.getElementById('stockImage');
    const setScaleBtn = document.getElementById('setScaleBtn');
    const calculateBtn = document.getElementById('calculateBtn');
    const canvas = document.getElementById('previewCanvas');
    const ctx = canvas.getContext('2d');
    const spinner = document.getElementById('spinner');
    const resultDiv = document.getElementById('cuttingResult');
    const scaleInfo = document.getElementById('scaleInfo');
    const canvasTitle = document.getElementById('canvasTitle');

    // --- 全局状态变量 ---
    let originalImage = null;
    let imageBase64 = '';
    let scale = 0; // mm per pixel
    let isSettingScale = false;
    let scalePoints = [];
    let devConfig = { dimensionTolerance: 5 }; // 默认容差

    function loadDevConfig() {
        const config = JSON.parse(localStorage.getItem('default'));
        if (config) {
            if (config.dimensionTolerance) {
                devConfig.dimensionTolerance = config.dimensionTolerance;
            }
            if (config.wireDiameter) {
                devConfig.wireDiameter = config.wireDiameter;
            }
        }
    }
    loadDevConfig();

    // --- 事件监听 ---

    imageInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            originalImage = new Image();
            originalImage.onload = () => {
                resetState();
                canvas.width = originalImage.width;
                canvas.height = originalImage.height;
                ctx.drawImage(originalImage, 0, 0);
                canvasTitle.textContent = "图片已上传，请设定比例尺";
            };
            originalImage.src = e.target.result;
            imageBase64 = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    setScaleBtn.addEventListener('click', () => {
        if (!originalImage) {
            alert('请先上传一张图片！');
            return;
        }
        isSettingScale = true;
        scalePoints = [];
        canvasTitle.textContent = "请在图上点击第一个点";
        canvas.style.cursor = 'crosshair';
    });

    canvas.addEventListener('click', (event) => {
        if (!isSettingScale) return;

        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (canvas.height / rect.height);
        scalePoints.push({ x, y });

        redrawCanvas();
        drawScalePoints();

        if (scalePoints.length === 2) {
            const realDistance = prompt('请输入这两点间的实际物理距离 (mm):');
            if (realDistance && !isNaN(realDistance) && realDistance > 0) {
                const pixelDistance = Math.sqrt(Math.pow(scalePoints[1].x - scalePoints[0].x, 2) + Math.pow(scalePoints[1].y - scalePoints[0].y, 2));
                scale = realDistance / pixelDistance;
                scaleInfo.innerHTML = `<b>当前比例尺:</b> ${(1/scale).toFixed(2)} pixel/mm`;
                canvasTitle.textContent = "比例尺设定完成，请输入参数后计算";
            } else {
                alert('请输入一个有效的正数！');
                scalePoints = [];
                canvasTitle.textContent = "设定失败, 请重新点击按钮开始";
            }
            isSettingScale = false;
            canvas.style.cursor = 'default';
        }
    });

    calculateBtn.addEventListener('click', async () => {
        if (!imageBase64) { alert('请先上传一张图片！'); return; }
        if (scale === 0) { alert('请先设定比例尺！'); return; }

        spinner.style.display = 'block';
        resultDiv.innerHTML = '';
        redrawCanvas();

        const payload = {
            image: imageBase64,
            scale: scale,
            stock_thickness: document.getElementById('stockThickness').value,
            sample_thickness: document.getElementById('sampleThickness').value,
            sample_width: document.getElementById('sampleWidth').value,
            sample_height: document.getElementById('sampleHeight').value,
            tolerance: devConfig.dimensionTolerance || 0,
            wire_diameter: devConfig.wireDiameter || 0 // 新增：传递线径参数
        };

        try {
            const response = await fetch('http://127.0.0.1:5001/process-image', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP 错误! 状态: ${response.status}`);
            }

            const data = await response.json();
            drawFinalPlan(data);
            
            // 根据返回的数据，决定显示加工指令还是简单的产出预估
            if (data.grid_info) {
                displayGridInfo(data);
            } else {
                resultDiv.innerHTML = `
                    <h4>产出预估:</h4>
                    <p><strong>总计可切割样品:</strong> ${data.total_samples} 个 (共 ${data.layers} 层)</p>
                    <p>(未找到可行的网格切割方案，显示为最大化填充方案)</p>
                `;
            }

        } catch (error) {
            console.error('计算失败:', error);
            resultDiv.innerHTML = `<p style="color: red;">计算失败: ${error.message}</p>`;
        } finally {
            spinner.style.display = 'none';
        }
    });

    function redrawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (originalImage) {
            ctx.drawImage(originalImage, 0, 0);
        }
    }
    
    function resetState() {
        redrawCanvas();
        scale = 0;
        isSettingScale = false;
        scalePoints = [];
        scaleInfo.innerHTML = '';
        resultDiv.innerHTML = '';
        canvasTitle.textContent = "";
        canvas.style.cursor = 'default';
    }

    function drawScalePoints() {
        ctx.fillStyle = '#ff00ff';
        scalePoints.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
            ctx.fill();
        });
        if (scalePoints.length === 2) {
            ctx.beginPath();
            ctx.moveTo(scalePoints[0].x, scalePoints[0].y);
            ctx.lineTo(scalePoints[1].x, scalePoints[1].y);
            ctx.strokeStyle = '#ff00ff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function drawFinalPlan(data) {
        ctx.beginPath();
        ctx.moveTo(data.contour[0][0], data.contour[0][1]);
        for (let i = 1; i < data.contour.length; i++) {
            ctx.lineTo(data.contour[i][0], data.contour[i][1]);
        }
        ctx.closePath();
        ctx.strokeStyle = 'lime';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 在绘制样品前，先绘制切割线
        if (data.grid_info) {
            drawGridLines(data.grid_info, data.scale);
        }

        data.placements.forEach((p, index) => { // 恢复index用于标注序号
            const [x, y, w, h] = p;
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);

            // 恢复样品序号的标注
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText(index + 1, x + 5, y + 15);
        });
    }

    // 新增：用于显示详细加工指令的函数
    function displayGridInfo(data) {
        const { grid_info, layers, total_samples, placements } = data;
        if (!grid_info || placements.length === 0) {
            resultDiv.innerHTML = `<p>未找到可行的网格切割方案。</p>`;
            return;
        }

        const { start_point_px, pitch_px, num_cuts, cut_order, bounding_box_origin_px } = grid_info;
        
        // 精确计算首刀偏移 (mm)
        // 定义: 从参考点(轮廓左上角)到第一条切割线的垂直距离
        const first_vertical_cut_px = start_point_px[0] + placements[0][2]; // 第一个样品的X + 它的宽度
        const first_horizontal_cut_px = start_point_px[1] + placements[0][3]; // 第一个样品的Y + 它的高度

        const offset_mm = {
            x: ((first_vertical_cut_px - bounding_box_origin_px[0]) * scale).toFixed(2),
            y: ((first_horizontal_cut_px - bounding_box_origin_px[1]) * scale).toFixed(2)
        };

        const pitch_mm = {
            x: (pitch_px[0] * scale).toFixed(2),
            y: (pitch_px[1] * scale).toFixed(2)
        };

        resultDiv.innerHTML = `
            <h4>加工指令:</h4>
            <p><strong>参考点:</strong> 物料轮廓左上角 (图中绿色圆点)</p>
            <p><strong>首刀横向偏移:</strong> ${offset_mm.x} mm</p>
            <p><strong>首刀纵向偏移:</strong> ${offset_mm.y} mm</p>
            <p><strong>切割顺序:</strong> ${cut_order}</p>
            <p><strong>竖向切割:</strong> ${num_cuts[0] > 1 ? num_cuts[0] - 1 : 0} 刀, 间距 ${pitch_mm.x} mm</p>
            <p><strong>横向切割:</strong> ${num_cuts[1] > 1 ? num_cuts[1] - 1 : 0} 刀, 间距 ${pitch_mm.y} mm</p>
            <hr>
            <h4>产出预估:</h4>
            <p><strong>总计可切割样品:</strong> ${total_samples} 个 (共 ${layers} 层)</p>
            <p><strong>使用线径:</strong> ${devConfig.wireDiameter || 0.42} mm</p>
        `;
    }

    // 新增：用于在画布上绘制切割网格和起切点的函数
    function drawGridLines(grid_info) {
        if(!grid_info) return;
        const { start_point_px, pitch_px, num_cuts, bounding_box_origin_px } = grid_info;
        const [ref_x, ref_y] = bounding_box_origin_px;
        const [start_x, start_y] = start_point_px;
        const [pitch_x, pitch_y] = pitch_px;
        const [num_v, num_h] = num_cuts;

        // --- 绘制参考点和偏移指示 ---
        // 标注参考点 (轮廓左上角)
        ctx.fillStyle = 'lime';
        ctx.beginPath();
        ctx.arc(ref_x, ref_y, 8, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.font = 'bold 12px Arial';
        ctx.fillText('Ref', ref_x - 8, ref_y + 4);

        // 绘制从参考点出发的垂线到第一条切割线
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        
        // 计算第一条切割线的位置
        const firstVerticalCut_x = start_x + pitch_x; // 第一条竖直线
        const firstHorizontalCut_y = start_y + pitch_y; // 第一条水平线
        
        // 绘制垂线到第一条竖直线
        ctx.beginPath();
        ctx.moveTo(ref_x, ref_y);
        ctx.lineTo(firstVerticalCut_x, ref_y);
        ctx.stroke();
        
        // 绘制垂线到第一条水平线
        ctx.beginPath();
        ctx.moveTo(ref_x, ref_y);
        ctx.lineTo(ref_x, firstHorizontalCut_y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // 标注垂线长度
        ctx.fillStyle = 'yellow';
        ctx.font = 'bold 14px Arial';
        const verticalDistance_mm = ((firstVerticalCut_x - ref_x) * scale).toFixed(1);
        const horizontalDistance_mm = ((firstHorizontalCut_y - ref_y) * scale).toFixed(1);
        ctx.fillText(`${verticalDistance_mm}mm`, ref_x + (firstVerticalCut_x - ref_x) / 2 - 15, ref_y - 10);
        ctx.fillText(`${horizontalDistance_mm}mm`, ref_x - 40, ref_y + (firstHorizontalCut_y - ref_y) / 2);


        // --- 绘制切割网格 ---
        ctx.setLineDash([5, 5]);
        
        // 绘制竖向切割线（垂直线）- 延伸到图片边界
        ctx.strokeStyle = 'cyan';
        for (let i = 1; i <= num_v; i++) {
            const x = start_x + i * pitch_x;
            ctx.beginPath();
            ctx.moveTo(x, 0); // 从顶部边界开始
            ctx.lineTo(x, canvas.height); // 延伸到底部边界
            ctx.stroke();
        }
        
        // 绘制横向切割线 - 延伸到图片边界
        ctx.strokeStyle = 'magenta';
        for (let i = 1; i <= num_h; i++) {
            const y = start_y + i * pitch_y;
            ctx.beginPath();
            ctx.moveTo(0, y); // 从左侧边界开始
            ctx.lineTo(canvas.width, y); // 延伸到右侧边界
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
});
