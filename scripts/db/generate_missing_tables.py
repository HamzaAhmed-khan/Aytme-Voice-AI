import os
import sys

# Add the app directory to sys.path
sys.path.insert(0, os.path.abspath('services/api'))

from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql
from models.models import Base, User, Organization, OrgMember, Room, BillingEvent, Quota, AuditLog, Participant, Transcript, TTSArtifact, WorkerAssignment, WorkerNode, ApiToken, Plan, Subscription, UsageRecord, PayPalWebhookEvent, Invoice, InviteToken, GracePeriod

def generate_sql():
    with open('output_tables.sql', 'w') as f:
        for table_name, table in Base.metadata.tables.items():
            create_stmt = CreateTable(table).compile(dialect=postgresql.dialect())
            sql = str(create_stmt).strip()
            # Inject IF NOT EXISTS
            sql = sql.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")
            f.write(sql + ";\n\n")
            
generate_sql()
print("SQL written to output_tables.sql")
