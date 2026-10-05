update public.leads
set classification = case
  when score >= 80 then 'hot'
  when score >= 40 then 'warm'
  else 'cold'
end
where classification is distinct from case
  when score >= 80 then 'hot'
  when score >= 40 then 'warm'
  else 'cold'
end;
