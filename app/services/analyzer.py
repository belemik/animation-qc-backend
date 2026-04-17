def analyze_video(video_id: str):
    return {
        "video_id": video_id,
        "defects": [
            {
                "time": 12,
                "type": "missing arm",
                "confidence": 0.91
            },
            {
                "time": 34,
                "type": "wrong clothes",
                "confidence": 0.76
            }
        ]
    }