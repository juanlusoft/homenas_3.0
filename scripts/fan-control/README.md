# HomePinas Fan Controller

Control de ventiladores PWM para Raspberry Pi CM5 con controlador EMC2305 via I2C.

## Hardware

- **Placa**: Raspberry Pi Compute Module 5
- **Controlador de ventiladores**: Microchip EMC2305 (I2C)
- **Dirección I2C**: `0x2e` en bus `i2c_csi_dsi0`
- **Canales disponibles**: 2 (pwm1, pwm2). Este script controla pwm1.

## Curva térmica

| Temperatura | Velocidad ventilador | PWM |
|-------------|---------------------|-----|
| ≤30°C       | Parado              | 0   |
| 40°C        | 15%                 | 38  |
| 50°C        | 30%                 | 77  |
| 55°C        | 45%                 | 115 |
| 60°C        | 70%                 | 179 |
| 70°C        | 90%                 | 230 |
| ≥75°C       | 100%                | 255 |

Entre puntos se interpola linealmente. Se aplica una histéresis de 2°C para evitar
que el ventilador suba y baje constantemente cerca de un umbral.

Al detener el servicio el ventilador se pone al 100% como medida de seguridad.

## Requisitos previos

El overlay del controlador I2C debe estar configurado en `/boot/firmware/config.txt`:

```
dtparam=i2c_arm=on
dtoverlay=i2c-fan,emc2301,addr=0x2e,i2c_csi_dsi0
```

Verificar que el controlador se detecta:

```bash
cat /sys/class/hwmon/hwmon*/name | grep emc2305
```

## Instalación

```bash
# Copiar el script
sudo cp fan-control.sh /usr/local/bin/fan-control.sh
sudo chmod +x /usr/local/bin/fan-control.sh

# Instalar el servicio systemd
sudo cp homepinas-fan.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now homepinas-fan.service
```

## Gestión del servicio

```bash
# Ver estado y logs
sudo systemctl status homepinas-fan.service
sudo journalctl -u homepinas-fan.service -f

# Reiniciar tras cambiar la curva
sudo systemctl restart homepinas-fan.service

# Desactivar
sudo systemctl disable --now homepinas-fan.service
```

## Verificación manual

```bash
# Temperatura actual
cat /sys/class/thermal/thermal_zone0/temp

# RPM y PWM actuales
cat /sys/class/hwmon/hwmon3/fan1_input
cat /sys/class/hwmon/hwmon3/pwm1

# Forzar PWM manualmente (0-255)
sudo sh -c 'echo 128 > /sys/class/hwmon/hwmon3/pwm1'
```

## Personalización

Editar las variables al inicio de `/usr/local/bin/fan-control.sh`:

- `INTERVAL`: segundos entre lecturas (default 5)
- `HYSTERESIS`: histéresis en miligrados (default 2000 = 2°C)
- `CURVE_TEMPS` / `CURVE_PWMS`: puntos de la curva térmica (en miligrados y PWM 0-255)

## Desinstalación

```bash
sudo systemctl disable --now homepinas-fan.service
sudo rm /etc/systemd/system/homepinas-fan.service
sudo rm /usr/local/bin/fan-control.sh
sudo systemctl daemon-reload
```
