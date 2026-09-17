FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates python3 xvfb x11vnc novnc websockify openbox \
       tigervnc-tools fonts-noto-cjk libnss3 libnspr4 libatk1.0-0 \
       libatk-bridge2.0-0 libatspi2.0-0 libx11-6 libxcomposite1 \
       libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libxcb1 \
       libxkbcommon0 libasound2t64 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /home/browser/profile /home/browser/.cache \
    && chown -R 1000:1000 /home/browser

COPY requirements.txt /opt/browser-search-requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv \
    && python3 -m venv /opt/browser-search-venv \
    && /opt/browser-search-venv/bin/pip install --no-cache-dir -r /opt/browser-search-requirements.txt \
    && rm -rf /var/lib/apt/lists/*
COPY session.py browser_search.py /opt/
ENV HOME=/home/browser DISPLAY=:99 PYTHONUNBUFFERED=1
USER 1000:1000
ENTRYPOINT ["python3", "/opt/session.py"]
