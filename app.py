from flask import Flask, render_template, jsonify, request
import hardware
import atexit

app = Flask(__name__)

# 啟動硬體背景讀取
hardware.start_hardware_thread()

# 確保程式結束時清理 GPIO
atexit.register(hardware.cleanup)

@app.route('/')
def index():
    """渲染主遊戲畫面"""
    return render_template('index.html')

@app.route('/api/state')
def get_state():
    """供前端抓取搖桿與光感狀態"""
    return jsonify(hardware.hardware_state)

@app.route('/api/feedback', methods=['POST'])
def trigger_feedback():
    """供前端傳送事件(得分/撞車)給硬體"""
    data = request.json
    event = data.get('event')
    score = data.get('score', 0)
    
    # 觸發硬體動作
    hardware.trigger_feedback(event, score)
    
    return jsonify({"status": "success"})

if __name__ == '__main__':
    # 允許所有 IP 存取，方便在樹莓派上執行時從手機或電腦開啟
    app.run(host='0.0.0.0', port=5001, debug=False)
