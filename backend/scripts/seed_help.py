from app.db.supabase import execute_sql_file

if __name__ == "__main__":
    execute_sql_file("sql/04_help_seed.sql")
