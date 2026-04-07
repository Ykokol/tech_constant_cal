
from flask import Flask, request, jsonify
import cv2
import numpy as np
import base64
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

def extract_contour(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    
    main_contour = max(contours, key=cv2.contourArea)
    
    # 轮廓平滑处理
    epsilon = 0.005 * cv2.arcLength(main_contour, True)
    smoothed_contour = cv2.approxPolyDP(main_contour, epsilon, True)
    
    return smoothed_contour

def calculate_cutting_plan(contour, image_shape, scale, sample_width, sample_height, tolerance, wire_diameter):
    print("正在计算方案A：使用目标尺寸...")
    placements_A, grid_A = find_best_plan_for_size(contour, image_shape, scale, sample_width, sample_height, 0, wire_diameter)

    print("正在计算方案B：使用最小容差尺寸...")
    placements_B, grid_B = find_best_plan_for_size(contour, image_shape, scale, sample_width, sample_height, tolerance, wire_diameter)

    if len(placements_A) >= len(placements_B):
        print(f"决策：选择方案A，产出 {len(placements_A)} 个。")
        return placements_A, grid_A
    else:
        print(f"决策：选择方案B，产出 {len(placements_B)} 个。")
        return placements_B, grid_B

def find_best_plan_for_size(contour, image_shape, scale, sample_w_mm, sample_h_mm, tolerance, wire_diameter):
    placements1, grid1 = find_best_grid_cutting(contour, image_shape, scale, sample_w_mm, sample_h_mm, tolerance, wire_diameter)
    placements2, grid2 = find_best_grid_cutting(contour, image_shape, scale, sample_h_mm, sample_w_mm, tolerance, wire_diameter)
    if len(placements1) >= len(placements2):
        return placements1, grid1
    else:
        return placements2, grid2

def find_best_grid_cutting(contour, image_shape, scale, sample_w_mm, sample_h_mm, tolerance_percent, wire_diameter_mm):
    if scale == 0: return [], None
    kerf_px = int(wire_diameter_mm / scale)

    tolerance_factor = 1.0 - (tolerance_percent / 100.0)
    sample_w_px = int(sample_w_mm * tolerance_factor / scale)
    sample_h_px = int(sample_h_mm * tolerance_factor / scale)
    if sample_w_px <= 0 or sample_h_px <= 0: return [], None

    pitch_w_px = sample_w_px + kerf_px
    pitch_h_px = sample_h_px + kerf_px

    mask = np.zeros(image_shape[:2], dtype=np.uint8)
    cv2.drawContours(mask, [contour], -1, 255, -1)
    x, y, w, h = cv2.boundingRect(contour)

    best_placements = []
    best_grid_info = None
    best_score = -1

    step = max(1, int(min(pitch_w_px, pitch_h_px) / 4))
    for start_r in range(y, y + step, max(1, step // 2)):
        for start_c in range(x, x + step, max(1, step // 2)):
            if pitch_w_px == 0 or pitch_h_px == 0: continue
            
            # 计算可能的切割数量
            num_cuts_v = (w - (start_c - x)) // pitch_w_px + 1
            num_cuts_h = (h - (start_r - y)) // pitch_h_px + 1
            if num_cuts_h <= 0 or num_cuts_v <= 0: continue

            current_placements = []
            valid_columns = set()
            valid_rows = set()
            
            for i in range(num_cuts_h):
                for j in range(num_cuts_v):
                    c = start_c + j * pitch_w_px
                    r = start_r + i * pitch_h_px
                    if r + sample_h_px > image_shape[0] or c + sample_w_px > image_shape[1]: continue
                    roi_mask = mask[r:r+sample_h_px, c:c+sample_w_px]
                    if roi_mask.shape[0] == sample_h_px and roi_mask.shape[1] == sample_w_px and np.all(roi_mask == 255):
                        current_placements.append((c, r, sample_w_px, sample_h_px))
                        valid_columns.add(j)
                        valid_rows.add(i)
            
            # 计算实际有效的切割数量
            # 只计算有样品的列和行之间的切割线
            actual_num_cuts_v = 0
            actual_num_cuts_h = 0
            
            if valid_columns:
                # 排序有效列
                sorted_columns = sorted(valid_columns)
                # 实际的切割数应该是有效列的数量
                # 这样可以确保每个样品的右侧都有一条切割线
                actual_num_cuts_v = len(sorted_columns)
            
            if valid_rows:
                # 排序有效行
                sorted_rows = sorted(valid_rows)
                # 实际的切割数应该是有效行的数量
                # 这样可以确保每个样品的底部都有一条切割线
                actual_num_cuts_h = len(sorted_rows)
            
            # 只有当有样品时才计算分数
            if len(current_placements) > 0:
                score = len(current_placements) * 1000 - (max(0, actual_num_cuts_v - 1) + max(0, actual_num_cuts_h - 1))
                if score > best_score:
                    best_score = score
                    best_placements = current_placements
                    best_grid_info = {
                        'start_point_px': (start_c, start_r),
                        'bounding_box_origin_px': (int(x), int(y)),
                        'pitch_px': (pitch_w_px, pitch_h_px),
                        'num_cuts': (actual_num_cuts_v, actual_num_cuts_h),
                        'cut_order': '先竖后横' if actual_num_cuts_v >= actual_num_cuts_h else '先横后竖'
                    }

    return best_placements, best_grid_info

@app.route('/process-image', methods=['POST'])
def process_image():
    data = request.json
    image_data = base64.b64decode(data['image'].split(',')[1])
    np_arr = np.frombuffer(image_data, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    scale = float(data['scale'])
    stock_thickness = float(data['stock_thickness'])
    sample_thickness = float(data['sample_thickness'])
    sample_width = float(data['sample_width'])
    sample_height = float(data['sample_height'])
    tolerance = float(data.get('tolerance', 0))
    wire_diameter = float(data.get('wire_diameter', 0))

    contour = extract_contour(image)
    if contour is None:
        return jsonify({'error': '未检测到轮廓'}), 400

    if sample_thickness == 0: return jsonify({'error': '样品厚度不能为0'}), 400
    layers = int(stock_thickness // sample_thickness)

    placements, grid_info = calculate_cutting_plan(contour, image.shape, scale, sample_width, sample_height, tolerance, wire_diameter)
    total_samples = len(placements) * layers

    response = {
        'contour': contour.squeeze().tolist(),
        'placements': placements,
        'total_samples': total_samples,
        'layers': layers,
        'grid_info': grid_info
    }
    
    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True, port=5001)
