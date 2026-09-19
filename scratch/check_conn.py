import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def check_conn():
    url = os.getenv("DATABASE_URL").replace("+asyncpg", "")
    print(f"Connecting to {url.split('@')[1] if '@' in url else url}")
    try:
        conn = await asyncpg.connect(url)
        print("Success!")
        await conn.close()
    except Exception as e:
        print(f"Failure: {e}")

asyncio.run(check_conn())
