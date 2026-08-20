#!/usr/bin/env python3
"""Collect what the browser cannot see.

Every probe is isolated: a missing command or an unreadable file sets its own
field to null and never prevents the others from answering. The launcher shows
a stale value with its age rather than an empty screen.
"""

import json
import os
import shutil
import subprocess
import time


def _run(args, timeout=2.0):
    try:
        # errors="replace": undecodable bytes become replacement characters
        # instead of raising, so a binary with garbled output still degrades
        # through the normal "bad JSON" path below rather than escaping here.
        out = subprocess.run(args, capture_output=True, timeout=timeout, text=True, errors="replace")
        return out.stdout if out.returncode == 0 else None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def battery():
    raw = _run(["termux-battery-status"])
    if not raw:
        return None
    try:
        d = json.loads(raw)
        return {
            "percent": d.get("percentage"),
            "charging": d.get("status") == "CHARGING",
            "temperature": d.get("temperature"),
        }
    except ValueError:
        return None


def wifi():
    raw = _run(["termux-wifi-connectioninfo"])
    if not raw:
        return None
    try:
        d = json.loads(raw)
        return {"ssid": d.get("ssid"), "rssi": d.get("rssi"), "link_speed": d.get("link_speed_mbps")}
    except ValueError:
        return None


def ip():
    raw = _run(["ip", "-j", "addr"])
    if raw:
        try:
            for iface in json.loads(raw):
                if iface.get("ifname") == "lo":
                    continue
                for a in iface.get("addr_info", []):
                    if a.get("family") == "inet":
                        return a.get("local")
        except ValueError:
            pass
    raw = _run(["ifconfig"])
    if raw:
        for line in raw.splitlines():
            line = line.strip()
            if line.startswith("inet ") and "127.0.0.1" not in line:
                return line.split()[1]
    return None


def cpu():
    try:
        load1, _, _ = os.getloadavg()
        count = os.cpu_count() or 1
        return {"load": round(min(1.0, load1 / count), 3)}
    except OSError:
        return None


def memory():
    try:
        info = {}
        with open("/proc/meminfo", "r", encoding="ascii") as fh:
            for line in fh:
                key, _, rest = line.partition(":")
                info[key] = int(rest.strip().split()[0])
        total = info.get("MemTotal", 0) // 1024
        available = info.get("MemAvailable", 0) // 1024
        return {"used_mb": total - available, "total_mb": total}
    except (OSError, ValueError, IndexError):
        return None


def storage():
    try:
        usage = shutil.disk_usage(os.path.expanduser("~"))
        return {"free_gb": round(usage.free / 1e9, 1), "total_gb": round(usage.total / 1e9, 1)}
    except OSError:
        return None


# Recorded once, at import: the wall-clock reference the derived uptime below
# counts forward from. monotonic(), not time(): a clock adjustment must not
# change how long this process has been alive.
_STARTED = time.monotonic()


def boot_offset_from(stat_line, clock_ticks):
    """Seconds from boot to when the process described by `stat_line` started.

    Field 22 of /proc/PID/stat is that instant, in clock ticks since boot.
    The parse splits on the LAST ')' rather than on whitespace, because field
    2 is the executable name in parentheses and may itself contain spaces and
    parentheses — the one field that makes a naive split wrong. Everything
    after that closing bracket is field 3 onward, so field 22 is index 19.
    """
    fields = stat_line.rsplit(")", 1)[1].split()
    return int(fields[19]) / clock_ticks


def uptime():
    """Seconds since the device booted.

    /proc/uptime first, which is the direct answer wherever it can be read.
    On Android it cannot: SELinux gives an unprivileged app /proc/meminfo but
    denies it /proc/uptime and /proc/loadavg, and the refusal was confirmed on
    the target device by an audit denial (`avc: denied { read } ... app=
    com.termux`). Hence the fallback, which reaches the same number without
    touching a restricted path: a process may always read its own /proc entry,
    that entry records when the process started relative to boot, and this
    module knows how long it has been running since.

    Slightly less exact than the direct read — it inherits the resolution of
    the clock-tick counter — and that is the whole cost.
    """
    try:
        with open("/proc/uptime", "r", encoding="ascii") as fh:
            return int(float(fh.read().split()[0]))
    except (OSError, ValueError, IndexError):
        pass
    try:
        with open("/proc/self/stat", "r", encoding="ascii") as fh:
            offset = boot_offset_from(fh.read(), os.sysconf("SC_CLK_TCK"))
        return int(offset + (time.monotonic() - _STARTED))
    except (OSError, ValueError, IndexError, ZeroDivisionError, AttributeError):
        return None


def snapshot():
    """Build the full envelope, isolating each probe from the others.

    Each probe already guards against the failures it expects (missing
    command, unreadable file, bad JSON). This loop is the backstop for
    whatever it doesn't expect — an output shape nobody anticipated, a
    permission error on a path we didn't foresee — so that any single
    probe raising can only null its own field. It can never take the rest
    of the envelope, or the HTTP response itself, down with it.
    """
    probes = {
        "ip": ip,
        "battery": battery,
        "wifi": wifi,
        "cpu": cpu,
        "memory": memory,
        "storage": storage,
        "uptime_s": uptime,
    }
    result = {"ts": int(time.time())}
    for key, probe in probes.items():
        try:
            result[key] = probe()
        except Exception:
            result[key] = None
    return result


if __name__ == "__main__":
    print(json.dumps(snapshot(), indent=2))
