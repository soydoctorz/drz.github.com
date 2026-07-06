.PHONY: help start stop

PORT ?= 8000
HOST ?= 127.0.0.1

help:
	@echo "Servidor local para probar drz.github.io"
	@echo ""
	@echo "  make start   - Arranca http://$(HOST):$(PORT) en segundo plano"
	@echo "  make stop    - Detiene el servidor en el puerto $(PORT)"
	@echo ""
	@echo "  PORT=3000 make start   - Usar otro puerto"

start:
	@echo "Starting server on http://$(HOST):$(PORT)"
	@nohup python3 -m http.server "$(PORT)" --bind "$(HOST)" >/dev/null 2>&1 &
	@sleep 0.2
	@echo "Started. Stop with: make stop"

stop:
	@echo "Stopping server on port $(PORT) (best-effort)"
	@PID="$$(lsof -tiTCP:$(PORT) -sTCP:LISTEN 2>/dev/null | head -n 1)"; \
	if [ -n "$$PID" ]; then \
		echo "Killing pid $$PID"; \
		kill "$$PID" 2>/dev/null || true; \
		sleep 0.2; \
		if kill -0 "$$PID" 2>/dev/null; then \
			echo "Still running, forcing stop (SIGKILL)"; \
			kill -9 "$$PID" 2>/dev/null || true; \
		fi; \
	else \
		echo "No process listening on $(PORT)."; \
	fi
