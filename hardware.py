import time
import threading

# 嘗試載入樹莓派硬體套件，若失敗則進入「模擬模式(Mock)」
try:
    import RPi.GPIO as GPIO
    import spidev

    # RFID
    try:
        from mfrc522 import SimpleMFRC522
        rfid_reader = SimpleMFRC522()
    except:
        rfid_reader = None
        
    HARDWARE_AVAILABLE = True
except ImportError:
    HARDWARE_AVAILABLE = False
    print("Warning: Running in MOCK mode. Hardware libraries not found.")

# 硬體腳位定義 (使用 BOARD / 實體 Pin 編號)
BUZZER_PIN = 12
LED_PIN = 16
BUTTON_PIN = 11

# MCP3008 通道
LIGHT_SENSOR_CH = 0
JOYSTICK_X_CH = 1
JOYSTICK_Y_CH = 2

# 全域狀態
hardware_state = {
    "joystick_x": 512,  
    "joystick_y": 512,
    "light_value": 512, 
    "button_pressed": False,
    "rfid_uid": None
}

siren_active = False
buzzer_pwm = None

def init_hardware():
    global spi, buzzer_pwm
    if not HARDWARE_AVAILABLE:
        return
    
    GPIO.setmode(GPIO.BOARD)
    GPIO.setwarnings(False)
    GPIO.setup(BUZZER_PIN, GPIO.OUT)
    GPIO.setup(LED_PIN, GPIO.OUT)
    GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    
    buzzer_pwm = GPIO.PWM(BUZZER_PIN, 500)
    
    spi = spidev.SpiDev()
    spi.open(0, 1) # Use CE1 for MCP3008 to avoid conflict with RFID on CE0
    spi.max_speed_hz = 1350000

def read_mcp3008(channel):
    if not HARDWARE_AVAILABLE or not spi:
        return 512  
    adc = spi.xfer2([1, (8 + channel) << 4, 0])
    data = ((adc[1] & 3) << 8) + adc[2]
    return data

def trigger_feedback(event, score=0):
    global siren_active
    
    if event == "siren_on":
        siren_active = True
        return
    elif event == "siren_off":
        siren_active = False
        if HARDWARE_AVAILABLE:
            GPIO.output(LED_PIN, GPIO.LOW)
        return
        
    if not HARDWARE_AVAILABLE:
        return

    if event == "score":
        if buzzer_pwm:
            buzzer_pwm.start(50)
            buzzer_pwm.ChangeFrequency(2000)
            time.sleep(0.05)
            buzzer_pwm.stop()
    elif event == "crash":
        siren_active = False 
        # 經典遊戲結束音效：漸弱降頻 (Womp Womp Womp...)
        game_over_notes = [600, 500, 400, 300, 200, 100]
        for i, note in enumerate(game_over_notes):
            if buzzer_pwm:
                buzzer_pwm.start(50)
                buzzer_pwm.ChangeFrequency(note)
            # 燈光配合音效閃爍
            GPIO.output(LED_PIN, GPIO.HIGH if i % 2 == 0 else GPIO.LOW)
            time.sleep(0.2)
        if buzzer_pwm:
            buzzer_pwm.stop()
        GPIO.output(LED_PIN, GPIO.HIGH) # 遊戲結束後保持長亮，直到新遊戲開始
        time.sleep(1)

def siren_loop():
    global siren_active, buzzer_pwm
    freq = 600
    up = True
    while True:
        if siren_active and HARDWARE_AVAILABLE and buzzer_pwm:
            try:
                buzzer_pwm.start(50)
                buzzer_pwm.ChangeFrequency(freq)
            except:
                pass
            
            if up:
                freq += 30
                if freq >= 1200: up = False
            else:
                freq -= 30
                if freq <= 600: up = True
                
            # Flash LED with the siren
            if HARDWARE_AVAILABLE:
                GPIO.output(LED_PIN, GPIO.HIGH if freq > 900 else GPIO.LOW)
                
            time.sleep(0.015)
        else:
            if HARDWARE_AVAILABLE:
                if buzzer_pwm:
                    buzzer_pwm.stop()
                GPIO.output(LED_PIN, GPIO.LOW)
            time.sleep(0.1)

def hardware_loop():
    global hardware_state
    while True:
        if HARDWARE_AVAILABLE:
            hardware_state["joystick_x"] = read_mcp3008(JOYSTICK_X_CH)
            hardware_state["joystick_y"] = read_mcp3008(JOYSTICK_Y_CH)
            hardware_state["light_value"] = read_mcp3008(LIGHT_SENSOR_CH)
            hardware_state["button_pressed"] = (GPIO.input(BUTTON_PIN) == GPIO.LOW)
            
            # Read RFID non-blocking if possible
            if rfid_reader:
                id = rfid_reader.read_id_no_block()
                if id:
                    hardware_state["rfid_uid"] = str(id)
                else:
                    hardware_state["rfid_uid"] = None
        else:
            # Mock mode defaults
            hardware_state["joystick_x"] = 512
            hardware_state["joystick_y"] = 512
            hardware_state["light_value"] = 800
            hardware_state["button_pressed"] = False
            hardware_state["rfid_uid"] = None
        
        time.sleep(0.05)

def start_hardware_thread():
    init_hardware()
    t = threading.Thread(target=hardware_loop, daemon=True)
    t.start()
    t_siren = threading.Thread(target=siren_loop, daemon=True)
    t_siren.start()

def cleanup():
    if HARDWARE_AVAILABLE:
        GPIO.cleanup()
        if 'spi' in globals() and spi:
            spi.close()
