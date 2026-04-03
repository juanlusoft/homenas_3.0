#!/bin/bash
# HomePinas Fan Controller - EMC2305 on Raspberry Pi CM5
# Custom thermal curve for PWM fan control
#
# Hardware: EMC2301/2305 on I2C (addr 0x2e, i2c_csi_dsi0)
# PWM path: /sys/class/hwmon/hwmonX (matched by name "emc2305")

set -euo pipefail

INTERVAL=5          # seconds between checks
HYSTERESIS=2000     # 2°C hysteresis in millidegrees

# Thermal curve: TEMP_mC PWM (0-255)
# <30°C=0%  40°C=15%  50°C=30%  55°C=45%  60°C=70%  70°C=90%  >=75°C=100%
CURVE_TEMPS=(30000 40000 50000 55000 60000 70000 75000)
CURVE_PWMS=(0     38    77    115   179   230   255)

get_hwmon_path() {
    for h in /sys/class/hwmon/hwmon*; do
        if [[ "$(cat "$h/name" 2>/dev/null)" == "emc2305" ]]; then
            echo "$h"
            return 0
        fi
    done
    echo "ERROR: emc2305 hwmon not found" >&2
    return 1
}

get_temp() {
    cat /sys/class/thermal/thermal_zone0/temp
}

calc_pwm() {
    local temp=$1
    local n=${#CURVE_TEMPS[@]}

    # Below minimum
    if (( temp <= CURVE_TEMPS[0] )); then
        echo "${CURVE_PWMS[0]}"
        return
    fi

    # Above maximum
    if (( temp >= CURVE_TEMPS[n-1] )); then
        echo "${CURVE_PWMS[n-1]}"
        return
    fi

    # Interpolate between curve points
    for (( i=1; i<n; i++ )); do
        if (( temp <= CURVE_TEMPS[i] )); then
            local t0=${CURVE_TEMPS[i-1]}
            local t1=${CURVE_TEMPS[i]}
            local p0=${CURVE_PWMS[i-1]}
            local p1=${CURVE_PWMS[i]}
            # Linear interpolation: p = p0 + (temp - t0) * (p1 - p0) / (t1 - t0)
            echo $(( p0 + (temp - t0) * (p1 - p0) / (t1 - t0) ))
            return
        fi
    done
}

HWMON=$(get_hwmon_path)
PWM_FILE="$HWMON/pwm1"
LAST_PWM=-1

echo "HomePinas fan controller started"
echo "Using hwmon: $HWMON"
echo "PWM file: $PWM_FILE"

cleanup() {
    echo "Shutting down - setting fan to 100%"
    echo 255 > "$PWM_FILE"
    exit 0
}
trap cleanup SIGTERM SIGINT

while true; do
    TEMP=$(get_temp)
    TARGET_PWM=$(calc_pwm "$TEMP")

    # Apply hysteresis: only decrease PWM if temp dropped enough
    if (( TARGET_PWM < LAST_PWM )); then
        HYST_PWM=$(calc_pwm $((TEMP + HYSTERESIS)))
        if (( HYST_PWM >= LAST_PWM )); then
            TARGET_PWM=$LAST_PWM
        fi
    fi

    if (( TARGET_PWM != LAST_PWM )); then
        echo "$TARGET_PWM" > "$PWM_FILE"
        echo "$(date '+%Y-%m-%d %H:%M:%S') temp=${TEMP}m°C pwm=${TARGET_PWM}/255"
        LAST_PWM=$TARGET_PWM
    fi

    sleep "$INTERVAL"
done
