-- Create profiles table
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT CHECK (role IN ('admin', 'cliente')) NOT NULL DEFAULT 'cliente',
  name TEXT NOT NULL
);

-- Create companies table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  cnpj TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create user_companies junction table
CREATE TABLE user_companies (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, company_id)
);

-- Create bank_statements table
CREATE TABLE bank_statements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  month_year TEXT NOT NULL, -- e.g., '10/2023'
  status TEXT CHECK (status IN ('PENDING', 'IN_REVIEW', 'APPROVED')) DEFAULT 'PENDING' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id UUID REFERENCES bank_statements(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  description TEXT NOT NULL,
  original_category TEXT,
  final_category TEXT,
  type TEXT CHECK (type IN ('Entrada', 'Saída')) NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT CHECK (status IN ('IN_REVIEW', 'APPROVED')) DEFAULT 'IN_REVIEW' NOT NULL
);

-- Set up Row Level Security (RLS)

-- Profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by users." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);

-- Companies RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Companies viewable by admin or associated users." ON companies FOR SELECT USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin') OR
  auth.uid() IN (SELECT user_id FROM user_companies WHERE company_id = id)
);

-- User_companies RLS
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User_companies viewable by admin or associated users." ON user_companies FOR SELECT USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin') OR
  auth.uid() = user_id
);

-- Bank Statements RLS
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Statements viewable by admin or associated users." ON bank_statements FOR SELECT USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin') OR
  auth.uid() IN (SELECT user_id FROM user_companies WHERE company_id = bank_statements.company_id)
);
CREATE POLICY "Statements insertable by associated users." ON bank_statements FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT user_id FROM user_companies WHERE company_id = bank_statements.company_id)
);

-- Transactions RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Transactions viewable by admin or associated users." ON transactions FOR SELECT USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin') OR
  auth.uid() IN (SELECT user_id FROM user_companies WHERE company_id = transactions.company_id)
);
CREATE POLICY "Transactions insertable by anyone authenticated (backend usually)." ON transactions FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
CREATE POLICY "Transactions updatable by admin." ON transactions FOR UPDATE USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
);
