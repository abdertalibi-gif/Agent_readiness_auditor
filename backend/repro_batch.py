"""Run the audit pipeline against a list of real sites; report pass/fail + error."""

import asyncio
import logging
import sys
import traceback

sys.path.insert(0, r"C:\Users\Abde\Desktop\aiagent\agent-readiness-auditor\backend")

logging.basicConfig(level=logging.WARNING, stream=sys.stdout, force=True)

SITES = [
    "https://example.com",
    "https://news.ycombinator.com",
    "https://www.wikipedia.org",
    "https://www.iana.org/domains/reserved",
    "https://httpbin.org/html",
    "https://www.w3.org/",
    "https://www.rust-lang.org/",
    "https://httpstat.us/404",
]


async def run_one(url: str) -> None:
    from app.database import async_session_factory
    from app.services.audit_service import create_audit, _execute_audit

    async with async_session_factory() as session:
        audit = await create_audit(session, None, url, max_pages=5)
        audit_id = audit.id
        await session.commit()

        from app.models import Audit

        async with async_session_factory() as session:
            audit = await session.get(Audit, audit_id)
            try:
                await _execute_audit(session, audit)
                await session.commit()
                print(f"RESULT {url} => OK status={audit.status} score={audit.score}")
            except BaseException as exc:  # noqa: BLE001
                print(f"RESULT {url} => CRASH {type(exc).__name__}: {exc}")
                traceback.print_exc()
                print("=" * 70)
            finally:
                await session.rollback()


async def main() -> None:
    from app.database import create_schema

    await create_schema()
    for u in SITES:
        try:
            await run_one(u)
        except Exception as exc:  # noqa: BLE001
            print(f"SETUP-ERROR {u}: {type(exc).__name__}: {exc}")
        await asyncio.sleep(1)


asyncio.run(main())