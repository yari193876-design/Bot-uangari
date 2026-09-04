export function formatRupiah(amount: number): string {
  if (isNaN(amount)) return 'Rp 0';
  return 'Rp ' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ];
    const dayName = days[date.getDay()];
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${dayName}, ${day} ${month} • ${hours}:${mins}`;
  } catch {
    return dateStr;
  }
}

export function getCategoryBadgeClass(category: string, type: 'pengeluaran' | 'pemasukan'): string {
  if (type === 'pemasukan') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  
  const cat = category.toLowerCase();
  if (cat.includes('makan') || cat.includes('minum')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (cat.includes('trans')) {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
  if (cat.includes('tagihan') || cat.includes('utilitas')) {
    return 'bg-purple-50 text-purple-700 border-purple-200';
  }
  if (cat.includes('belanja')) {
    return 'bg-pink-50 text-pink-700 border-pink-200';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200';
}
