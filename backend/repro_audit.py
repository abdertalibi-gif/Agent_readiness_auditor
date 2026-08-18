"""Reproduce the 'Analyzing structure' audit failure with full traceback."""

import asyncio
import logging
import sys
import traceback

sys.path.insert(0, r"C:\Users\Abde\Desktop\aiagent\agent-readiness-auditor\backend")

logging.basicConfig(level=logging.DEBUG, stream=sys.stdout, force=True)


async def main() -> None:
    from app.database import async_session_factory, create_schema
    from app.services.audit_service import create_audit, run_audit_job

    await create_schema()

    url = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"

    async with async_session_factory() as session:
        audit = await create_audit(session, None, url, max_pages=5)
        audit_id = audit.id
        print(f"AUDIT_ID={audit_id} URL={url}")
        await session.commit()

    # Now run the job, monkeypatching to surface exceptions instead of swallowing.
    from app.services import audit_service
    import traceback as tb

    async with async_session_factory() as session:
        audit = await session.get(__import__("app.models", fromlist=["Audit"]).Audit, audit_id)
        try:
            await audit_service._execute_audit(session, audit)
            await session.commit()
            print("PIPELINE OK")
        except Exception:
            print("=" * 60)
            print("PIPELINE EXCEPTION:")
            tb.print_exc()
            print("=" * 60)


asyncio.run(main())