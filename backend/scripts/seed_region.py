from app.db.supabase import execute_sql_file

if __name__ == "__main__":
    execute_sql_file("sql/02_region_seed.sql")