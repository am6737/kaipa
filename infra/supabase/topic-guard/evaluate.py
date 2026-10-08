"""Real-model boundary evaluation, executed inside the internal container."""
import asyncio
import json
import os
import sys
from pathlib import Path

import httpx


async def main():
    cases = json.loads(Path(__file__).with_name("eval_cases.json").read_text())
    capacity = asyncio.Semaphore(4)
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8788", timeout=35,
                                 headers={"Authorization": "Bearer " + os.environ["TOPIC_GUARD_TOKEN"]}) as client:
        async def evaluate(case):
            async with capacity:
                response = await client.post("/check", json={"latestMessage": case["message"],
                    "pendingQuestion": case.get("pendingQuestion"), "recentMessages": case.get("history", [])})
            result = response.json()
            return {"message": case["message"], "expected": case["allowed"],
                    "actual": result.get("allowed"), "durationMs": result.get("durationMs"),
                    "passed": response.status_code == 200 and result.get("allowed") is case["allowed"]}
        results = await asyncio.gather(*(evaluate(case) for case in cases))
    print(json.dumps({"passed": sum(row["passed"] for row in results), "total": len(results),
                      "falseAccepts": sum(row["actual"] is True and not row["expected"] for row in results),
                      "falseRejects": sum(row["actual"] is False and row["expected"] for row in results),
                      "results": results}, ensure_ascii=False, indent=2))
    return 0 if all(row["passed"] for row in results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
