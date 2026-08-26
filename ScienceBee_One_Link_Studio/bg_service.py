"""
Local background-removal microservice for Science Bee One-Link Studio.

Uses the free, self-hosted `withoutbg` open-weights model (CPU, no API key,
no per-image cost). The Next.js app calls POST /remove with an image file
and gets back a transparent PNG.

Run it (see setup notes):
    pip install -r requirements.txt
    uvicorn bg_service:app --host 127.0.0.1 --port 8600

The first request downloads the model (~495 MB) from Hugging Face and then
caches it. Keep the process alive so the model stays loaded in memory.
"""

import io
import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from withoutbg import WithoutBG

app = FastAPI(title="ScienceBee BG Remover")

# Load the open-weights model ONCE at startup (free, local, CPU).
model = WithoutBG.open_weights()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/remove")
async def remove(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    # withoutbg's remove_background takes a file path, so write to a temp file
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    try:
        tmp.write(data)
        tmp.close()
        result = model.remove_background(tmp.name)  # PIL Image, RGBA
        buf = io.BytesIO()
        result.save(buf, format="PNG")  # preserve transparency
        return Response(content=buf.getvalue(), media_type="image/png")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
