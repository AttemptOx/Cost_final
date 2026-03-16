import React, { useState, useEffect } from 'react';
import { Plus, Download, FileText, TrendingUp, X as CloseIcon, Camera, Utensils, History, ArrowRightLeft, ArrowLeft, ShoppingBag, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Ingredient, Meal, USERS, UserId, Debt, Settlement } from './types';
import { PurchaseCard } from './components/PurchaseCard';
import { MealCard } from './components/MealCard';
import { Avatar } from './components/Avatar';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { domToCanvas } from 'modern-screenshot';
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';

interface ParticipantAvatarProps {
  id: UserId;
}

const ParticipantAvatar: React.FC<ParticipantAvatarProps> = ({ id }) => {
  const [selected, setSelected] = useState(false);
  return (
    <label className="relative cursor-pointer">
      <input 
        type="checkbox" 
        name="participants" 
        value={id} 
        className="peer sr-only" 
        onChange={(e) => setSelected(e.target.checked)}
      />
      <Avatar 
        id={id} 
        size="md" 
        grayscale={!selected} 
        opacity={selected ? 1 : 0.4}
        className="border-none shadow-none"
      />
    </label>
  );
};

export default function App() {
  const ingredients = useLiveQuery(() => db.ingredients.reverse().toArray()) || [];
  const meals = useLiveQuery(() => db.meals.reverse().toArray()) || [];
  const settlements = useLiveQuery(() => db.settlements.reverse().toArray()) || [];

  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'generating'>('idle');
  const [warning, setWarning] = useState<{ show: boolean, msg: string }>({ show: false, msg: '' });
  const [toast, setToast] = useState<{ show: boolean, msg: string, type: 'success' | 'info' }>({ show: false, msg: '', type: 'success' });

  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserId | null>(null);
  const [settleProgress, setSettleProgress] = useState(0);
  const [settleTimerRef] = useState<{ current: NodeJS.Timeout | null }>({ current: null });

  // Navigation Back Button Handler
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (showAddPurchase) setShowAddPurchase(false);
      else if (showAddMeal) setShowAddMeal(false);
      else if (showExportModal) setShowExportModal(false);
      else if (showHistory) {
        setShowHistory(false);
        setShowSettlement(false);
      }
      else if (showSettlement) setShowSettlement(false);
      else if (selectedSettlementId) setSelectedSettlementId(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showAddPurchase, showAddMeal, showExportModal, showHistory, showSettlement, selectedSettlementId]);

  // Push state when modals or history mode open
  useEffect(() => {
    if (showAddPurchase || showAddMeal || showExportModal || showSettlement || selectedSettlementId) {
      window.history.pushState({ modal: true }, '');
    }
  }, [showAddPurchase, showAddMeal, showExportModal, showSettlement, selectedSettlementId]);
  const executeExport = async (blobData: Blob, fileName: string, isPdf = false) => {
    const mimeType = isPdf ? 'application/pdf' : 'text/csv;charset=utf-8;';
    const file = new File([blobData], fileName, { type: mimeType });
    
    // 1. Try Web Share API (Mobile Priority)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: isPdf ? '🍳 我们的伙食日记' : '💰 合租平账清单',
          text: '这是最新的账单数据，请查收！',
          files: [file],
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Share failed, falling back to download:', err);
      }
    }

    // 2. Fallback for Desktop (Standard Download)
    try {
      const url = window.URL.createObjectURL(blobData);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      
      // Ensure link is in document for some browsers
      link.style.display = 'none';
      document.body.appendChild(link);
      
      // Trigger click
      link.click();
      
      // Cleanup with a longer delay to ensure download starts
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      console.error('Download fallback failed:', err);
      setWarning({ show: true, msg: '导出失败，请尝试在浏览器新标签页打开后重试' });
    }
  };

  const [showDateBadge, setShowDateBadge] = useState(false);
  const scrollTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Scroll listener for date badge
  useEffect(() => {
    const handleScroll = () => {
      setShowDateBadge(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        setShowDateBadge(false);
      }, 1500);
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  // Calculations
  const calculateBalances = () => {
    const balances: Record<UserId, number> = { Z: 0, X: 0, Y: 0 };
    const unsettledIngredients = ingredients.filter(i => !i.settledAt);
    const unsettledMeals = meals.filter(m => !m.settledAt);

    unsettledIngredients.forEach((ing) => {
      balances[ing.purchaserId] += ing.totalPrice;
    });

    unsettledMeals.forEach((meal) => {
      meal.consumptions.forEach((cons) => {
        const perPersonCost = cons.cost / meal.participants.length;
        meal.participants.forEach((pid) => {
          balances[pid] -= perPersonCost;
        });
      });
    });
    return balances;
  };

  const calculateDebts = (balancesInput?: Record<UserId, number>): Debt[] => {
    const balances = balancesInput || calculateBalances();
    const debts: Debt[] = [];
    const sortedBalances = Object.entries(balances)
      .map(([id, balance]) => ({ id: id as UserId, balance }))
      .sort((a, b) => a.balance - b.balance);

    let i = 0;
    let j = sortedBalances.length - 1;

    while (i < j) {
      const debtor = sortedBalances[i];
      const creditor = sortedBalances[j];
      const amount = Math.min(-debtor.balance, creditor.balance);

      if (amount > 0.01) {
        debts.push({ from: debtor.id, to: creditor.id, amount });
      }

      debtor.balance += amount;
      creditor.balance -= amount;

      if (Math.abs(debtor.balance) < 0.01) i++;
      if (Math.abs(creditor.balance) < 0.01) j--;
    }

    return debts;
  };

  const showToast = (msg: string, type: 'success' | 'info' = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 1500);
  };

  const handleAddPurchase = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newIng: Ingredient = {
      id: Math.random().toString(36).substr(2, 9),
      name: formData.get('name') as string,
      totalPrice: parseFloat(formData.get('price') as string),
      remainingPercent: 100,
      purchaseDate: Date.now(),
      purchaserId: formData.get('purchaser') as UserId,
    };
    await db.ingredients.add(newIng);
    setShowAddPurchase(false);
    showToast('食材入库成功！');
  };

  const handleAddMeal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const participants = Array.from(formData.getAll('participants')) as UserId[];
    
    if (participants.length === 0) {
      setWarning({ show: true, msg: '这顿饭总得有人吃吧？。' });
      return;
    }

    // Handle image upload with compression
    const photoFile = formData.get('photo') as File;
    let photoUrl = '';
    if (photoFile && photoFile.size > 0) {
      photoUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxSide = 800;
            if (width > height) {
              if (width > maxSide) {
                height *= maxSide / width;
                width = maxSide;
              }
            } else {
              if (height > maxSide) {
                width *= maxSide / height;
                height = maxSide;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.6));
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(photoFile);
      });
    }

    // Extract consumptions from dynamic inputs
    const consumptions: any[] = [];
    const activeIngredients = ingredients.filter(i => i.remainingPercent > 0);
    
    activeIngredients.forEach(ing => {
      const percent = parseInt(formData.get(`percent_${ing.id}`) as string || '0');
      if (percent > 0) {
        const cost = (ing.totalPrice * percent) / 100;
        consumptions.push({ ingredientId: ing.id, percentUsed: percent, cost });
      }
    });

    if (consumptions.length === 0) {
      setWarning({ show: true, msg: '请至少消耗一种食材！' });
      return;
    }

    const note = formData.get('note') as string;
    if (!note.trim()) {
      setWarning({ show: true, msg: '请填写备注！' });
      return;
    }

    // Update ingredients only after validation
    for (const ing of activeIngredients) {
      const percent = parseInt(formData.get(`percent_${ing.id}`) as string || '0');
      if (percent > 0) {
        await db.ingredients.update(ing.id, { 
          remainingPercent: Math.max(0, ing.remainingPercent - percent) 
        });
      }
    }

    const newMeal: Meal = {
      id: Math.random().toString(36).substr(2, 9),
      date: Date.now(),
      participants,
      consumptions,
      note,
      photoUrl: photoUrl || undefined,
    };

    await db.meals.add(newMeal);
    setShowAddMeal(false);
    showToast('美食记录成功！');
  };

  const handleSettleAll = async () => {
    const now = Date.now();
    const balances = calculateBalances();
    const debts = calculateDebts(balances);
    const settlementId = Math.random().toString(36).substr(2, 9);
    
    const newSettlement: Settlement = {
      id: settlementId,
      date: now,
      debts,
      balances
    };

    await db.settlements.add(newSettlement);
    await db.ingredients.filter(i => !i.settledAt).modify({ settledAt: now, settlementId });
    await db.meals.filter(m => !m.settledAt).modify({ settledAt: now, settlementId });
    
    setShowSettlement(false);
    setSelectedUserDetail(null);
    setSettleProgress(0);
    showToast('账单已平，又是新的一天！');
  };

  const startSettleTimer = () => {
    // Check for unfinished items before starting
    const hasUnfinishedItems = ingredients.some(i => !i.settledAt && i.remainingPercent > 0);
    if (hasUnfinishedItems) {
      setWarning({ show: true, msg: '无法平账：还有没吃完的菜呢！' });
      return;
    }

    setSettleProgress(0);
    const startTime = Date.now();
    const duration = 2000;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setSettleProgress(progress);
      
      if (progress < 100) {
        settleTimerRef.current = setTimeout(updateProgress, 50);
      } else {
        handleSettleAll();
      }
    };
    
    updateProgress();
  };

  const cancelSettleTimer = () => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setSettleProgress(0);
  };

  const exportCSV = () => {
    let csv = '\uFEFF时间,类型,品名,垫资人,参与者,消耗比例,折算金额,结余比例\n';
    
    // Filter based on current view
    const filteredIngredients = selectedSettlementId 
      ? ingredients.filter(i => i.settlementId === selectedSettlementId)
      : ingredients.filter(i => !i.settledAt);
    
    const filteredMeals = selectedSettlementId
      ? meals.filter(m => m.settlementId === selectedSettlementId)
      : meals.filter(m => !m.settledAt);

    // Combine and sort events ASCENDING to track balance
    const events = [
      ...filteredIngredients.map(i => ({ ...i, type: '购买', date: i.purchaseDate })),
      ...filteredMeals.flatMap(m => m.consumptions.map(c => ({
        ...c,
        date: m.date,
        participants: m.participants.join('+'),
        type: '消耗',
        name: ingredients.find(ing => ing.id === c.ingredientId)?.name
      })))
    ].sort((a: any, b: any) => a.date - b.date);

    const batchBalances: Record<string, number> = {};

    events.forEach((ev: any) => {
      const date = format(ev.date, 'yyyy-MM-dd HH:mm');
      if (ev.type === '购买') {
        batchBalances[ev.id] = 100;
        csv += `${date},购买,${ev.name},${ev.purchaserId},-,100%,${ev.totalPrice},100%\n`;
      } else {
        const prevBalance = batchBalances[ev.ingredientId] || 100;
        const newBalance = prevBalance - ev.percentUsed;
        batchBalances[ev.ingredientId] = newBalance;
        csv += `${date},消耗,${ev.name},-,${ev.participants},${ev.percentUsed}%,${ev.cost.toFixed(2)},${newBalance}%\n`;
      }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    executeExport(blob, `RoomieEats_Audit_${format(new Date(), 'yyyyMMdd')}.csv`, false);
  };

  const exportPDF = async () => {
    const element = document.getElementById('timeline-container');
    if (!element) return;

    if (timelineItems.length > 40) {
      const confirm = window.confirm('当前记录较多，生成 PDF 可能需要较长时间且容易导致 App 闪退。建议先平账后再按批次导出。是否继续？');
      if (!confirm) return;
    }

    setExportStatus('generating');
    try {
      // modern-screenshot handles oklch and modern CSS much better than html2canvas
      const canvas = await domToCanvas(element, {
        scale: 2,
        backgroundColor: '#F8F9FA',
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgProps = pdf.getImageProperties(imgData);
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= 297; // A4 height in mm

      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= 297;
      }

      const pdfBlob = pdf.output('blob');
      await executeExport(pdfBlob, `RoomieEats_LifeLog_${format(new Date(), 'yyyyMMdd')}.pdf`, true);
    } catch (err) {
      console.error('PDF Export Error:', err);
      setWarning({ show: true, msg: 'PDF 生成失败，请重试' });
    } finally {
      setExportStatus('idle');
    }
  };

  const timelineItems = selectedSettlementId 
    ? [
        ...ingredients.filter(i => i.settlementId === selectedSettlementId).map(i => ({ type: 'purchase' as const, date: i.purchaseDate, data: i })),
        ...meals.filter(m => m.settlementId === selectedSettlementId).map(m => ({ type: 'meal' as const, date: m.date, data: m }))
      ].sort((a, b) => b.date - a.date)
    : [
        ...ingredients.filter(i => !i.settledAt).map(i => ({ type: 'purchase' as const, date: i.purchaseDate, data: i })),
        ...meals.filter(m => !m.settledAt).map(m => ({ type: 'meal' as const, date: m.date, data: m }))
      ].sort((a, b) => b.date - a.date);

  // Group items by date
  const groupedItems: { date: string, items: typeof timelineItems }[] = [];
  timelineItems.forEach(item => {
    const dateStr = format(item.date, 'yyyy-MM-dd');
    const group = groupedItems.find(g => g.date === dateStr);
    if (group) {
      group.items.push(item);
    } else {
      groupedItems.push({ date: dateStr, items: [item] });
    }
  });

  return (
    <div className="min-h-screen bg-app-bg text-gray-900 font-sans pb-32">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {selectedSettlementId && (
              <motion.button 
                whileTap={{ scale: 0.8, rotate: -5 }}
                onClick={() => setSelectedSettlementId(null)}
                className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </motion.button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-gray-900">RoomieEats</h1>
                {selectedSettlementId && (
                  <span className="px-2 py-0.5 bg-gray-900 text-white text-[10px] font-bold rounded-md uppercase tracking-widest">History</span>
                )}
              </div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Shared Kitchen Ledger</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!selectedSettlementId && (
              <motion.button 
                whileTap={{ scale: 0.8, rotate: 5 }}
                onClick={() => setShowSettlement(true)}
                className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <TrendingUp className="w-5 h-5 text-gray-600" />
              </motion.button>
            )}
            <div className="flex -space-x-2">
              <Avatar id="Z" size="sm" className="ring-2 ring-white" />
              <Avatar id="X" size="sm" className="ring-2 ring-white" />
              <Avatar id="Y" size="sm" className="ring-2 ring-white" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Timeline */}
      <AnimatePresence mode="wait">
        <motion.main 
          key={selectedSettlementId || 'current'}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          id="timeline-container" 
          className="max-w-3xl mx-auto px-4 pt-8 relative"
        >
        {timelineItems.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <Utensils className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-400 font-medium">还没有记录，开始做饭吧！</p>
          </div>
        ) : (
          <div className="space-y-12">
            {groupedItems.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-8">
                {/* Date Capsule */}
                <div className="flex justify-center sticky top-20 z-10 pointer-events-none">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: showDateBadge ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                    className="bg-badge-bg text-badge-text px-4 py-1.5 rounded-full text-xs font-black shadow-sm backdrop-blur-md flex items-center gap-2"
                  >
                    <span>{format(new Date(group.date), 'MM月dd日')}</span>
                    <span className="opacity-50">{format(new Date(group.date), 'EEEE')}</span>
                  </motion.div>
                </div>

                <div className="space-y-6">
                  {group.items.map((item, idx) => (
                    <motion.div
                      key={`${item.type}-${item.data.id}`}
                      id={`card-${item.data.id}`}
                      initial={{ opacity: 0, x: item.type === 'purchase' ? -20 : 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`flex w-full ${item.type === 'purchase' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div className="w-[90%] sm:w-[85%]">
                        {item.type === 'purchase' ? (
                          <PurchaseCard ingredient={item.data as Ingredient} />
                        ) : (
                          <MealCard meal={item.data as Meal} ingredients={ingredients} />
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        </motion.main>
      </AnimatePresence>

      {/* Bottom Dock */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[95%] max-w-lg z-50">
        <div className="bg-white/90 backdrop-blur-2xl p-2 rounded-[2.5rem] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-200 flex items-center justify-between">
          {/* Left: Core Action Buttons */}
          <div className="flex items-center gap-2">
            {!selectedSettlementId ? (
              <>
                <motion.button 
                  whileTap={{ scale: 0.88, y: 2 }}
                  onClick={() => setShowAddPurchase(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-900 rounded-full font-black text-sm shadow-sm border border-gray-100 hover:bg-gray-50 transition-all whitespace-nowrap flex-nowrap"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-shrink-0">入库</span>
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.88, y: 2 }}
                  onClick={() => setShowAddMeal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-full font-black text-sm shadow-md shadow-emerald-100 hover:bg-emerald-600 transition-all whitespace-nowrap flex-nowrap"
                >
                  <Utensils className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-shrink-0">开饭</span>
                </motion.button>
              </>
            ) : (
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-full flex items-center gap-3"
              >
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-xs font-black uppercase tracking-widest whitespace-nowrap">历史模式</span>
              </motion.div>
            )}
          </div>

          {/* Right: Management Icons */}
          <div className="flex items-center gap-1 pr-2">
            <motion.button 
              whileTap={{ scale: 0.75, rotate: -10 }}
              onClick={() => setShowExportModal(true)}
              className="p-3 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-all"
              title="导出数据"
            >
              <Download className="w-5 h-5" />
            </motion.button>
            <motion.button 
              whileTap={{ scale: 0.75, rotate: 10 }}
              onClick={() => {
                setShowSettlement(true);
                setShowHistory(true);
              }}
              className="p-3 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-all"
              title="结算历史"
            >
              <History className="w-5 h-5" />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddPurchase && (
          <Modal title="新增食材入库" onClose={() => setShowAddPurchase(false)}>
            <form onSubmit={handleAddPurchase} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">食材名称</label>
                <input required name="name" type="text" className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-900 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">总金额 (¥)</label>
                <input required name="price" type="number" step="0.01" className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-900 transition-all font-mono text-lg" />
              </div>
              <div className="space-y-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">谁买的？</label>
                <div className="flex gap-4 pt-3 pb-4">
                  {(['Z', 'X', 'Y'] as UserId[]).map(id => (
                    <label key={`purchaser-${id}`} className="relative cursor-pointer group">
                      <input required type="radio" name="purchaser" value={id} className="peer sr-only" />
                      <div className="peer-checked:ring-4 peer-checked:ring-offset-2 ring-emerald-500 transition-all rounded-full">
                        <Avatar id={id} size="md" />
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <motion.button 
                type="submit" 
                whileTap={{ scale: 0.92 }}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-lg shadow-lg shadow-gray-200 transition-all"
              >
                确认入库
              </motion.button>
            </form>
          </Modal>
        )}

        {showAddMeal && (
          <Modal title="记录本次餐饮" onClose={() => setShowAddMeal(false)}>
            <form onSubmit={handleAddMeal} className="space-y-8">
              <div className="space-y-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">谁吃了？</label>
                <div className="flex gap-4 pt-3 pb-4">
                  {(['Z', 'X', 'Y'] as UserId[]).map(id => (
                    <ParticipantAvatar key={`meal-participant-${id}`} id={id} />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">消耗食材</label>
                <div className="space-y-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {ingredients.filter(i => i.remainingPercent > 0).map(ing => (
                    <div key={ing.id} className="space-y-2 p-4 bg-gray-50 rounded-2xl">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-700">{ing.name}</span>
                        <span className="text-xs text-gray-400">剩余 {ing.remainingPercent}%</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <input 
                          type="range" 
                          name={`percent_${ing.id}`}
                          min="0" 
                          max={ing.remainingPercent} 
                          step="1"
                          defaultValue="0"
                          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          onChange={(e) => {
                            const val = e.target.value;
                            const display = e.target.nextElementSibling;
                            if (display) display.textContent = `${val}%`;
                          }}
                        />
                        <span className="w-12 text-sm font-mono font-bold text-emerald-600"></span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        {[25, 33, 50, 100].filter(p => p <= ing.remainingPercent).map(p => (
                          <motion.button
                            key={p}
                            whileTap={{ scale: 0.85 }}
                            type="button"
                            onClick={(e) => {
                              const slider = e.currentTarget.parentElement?.previousElementSibling?.querySelector('input');
                              if (slider) {
                                slider.value = p.toString();
                                slider.dispatchEvent(new Event('change', { bubbles: true }));
                                const display = slider.nextElementSibling;
                                if (display) display.textContent = `${p}%`;
                              }
                            }}
                            className="text-[10px] px-2 py-1 bg-white rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                          >
                            {p === 100 ? '全部' : `${p}%`}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {ingredients.filter(i => i.remainingPercent > 0).length === 0 && (
                    <div className="text-center py-12 space-y-6">
                      <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                        <ShoppingBag className="w-10 h-10 text-gray-200" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-gray-900 font-bold">冰箱在喊饿...</p>
                        <p className="text-gray-400 text-xs">库存空空如也，快去买点菜吧</p>
                      </div>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          setShowAddMeal(false);
                          setShowAddPurchase(true);
                        }}
                        className="px-8 py-3 bg-gray-900 text-white rounded-2xl font-bold text-sm hover:scale-105 transition-all shadow-lg shadow-gray-200"
                      >
                        立即去入库
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">上传美食照片</label>
                <div className="relative group">
                  <input 
                    type="file" 
                    name="photo" 
                    accept="image/*" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        const preview = (e.target as HTMLInputElement).nextElementSibling as HTMLDivElement;
                        reader.onload = (ev) => {
                          preview.style.backgroundImage = `url(${ev.target?.result})`;
                          preview.innerHTML = '';
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <div className="w-full h-32 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 transition-all group-hover:border-emerald-500 group-hover:bg-emerald-50/30 bg-cover bg-center">
                    <Camera className="w-6 h-6 text-gray-300 group-hover:text-emerald-500" />
                    <span className="text-xs text-gray-400 group-hover:text-emerald-600">点击上传照片</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">备注/心情 (必填)</label>
                <textarea required name="note" placeholder="今天做什么吃了？" className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500 transition-all h-24 resize-none text-base" />
              </div>

              <motion.button 
                type="submit" 
                whileTap={{ scale: 0.92 }}
                className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-100 transition-all"
              >
                记录美食
              </motion.button>
            </form>
          </Modal>
        )}

        {showExportModal && (
          <Modal title="导出记录" onClose={() => !exportStatus.includes('generating') && setShowExportModal(false)}>
            <div className="space-y-8">
              <div className="space-y-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">选择导出格式</label>
                <div className="grid grid-cols-1 gap-3">
                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    disabled={exportStatus === 'generating'}
                    onClick={async () => { 
                      setExportStatus('generating');
                      await exportCSV(); 
                      setExportStatus('idle');
                      setShowExportModal(false); 
                    }}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                        <Download className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-gray-900">导出 CSV 明细</p>
                        <p className="text-[10px] text-gray-400">适合 Excel 财务对账</p>
                      </div>
                    </div>
                    {exportStatus === 'generating' ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                    ) : (
                      <ArrowRightLeft className="w-4 h-4 text-gray-300 group-hover:text-gray-900 transition-colors" />
                    )}
                  </motion.button>

                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    disabled={exportStatus === 'generating'}
                    onClick={async () => { 
                      await exportPDF(); 
                      setShowExportModal(false); 
                    }}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-rose-100 text-rose-500 rounded-lg">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-gray-900">导出 PDF 日志</p>
                        <p className="text-[10px] text-gray-400">包含美食照片的精美日志</p>
                      </div>
                    </div>
                    {exportStatus === 'generating' ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                    ) : (
                      <ArrowRightLeft className="w-4 h-4 text-gray-300 group-hover:text-gray-900 transition-colors" />
                    )}
                  </motion.button>
                </div>
              </div>
              
              {exportStatus === 'generating' && (
                <div className="flex items-center justify-center gap-3 p-4 bg-gray-50 rounded-2xl animate-pulse">
                  <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-bold text-gray-900">正在生成，请稍候...</span>
                </div>
              )}
              
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-xs text-amber-700 leading-relaxed">
                  💡 <b>长期使用建议：</b><br/>
                  为了保证 App 运行流畅，建议每月平账后导出一次 PDF 存档到微信。当前导出范围：{selectedSettlementId ? '选中的历史批次' : '当前未结算记录'}。
                </p>
              </div>
            </div>
          </Modal>
        )}

        {showSettlement && (
          <Modal 
            title={showHistory ? "历史结算记录" : "当前结算单"} 
            onClose={() => { setShowSettlement(false); setSelectedUserDetail(null); setShowHistory(false); }}
          >
            <div className="relative min-h-[400px]">
              <AnimatePresence mode="wait">
                {!showHistory ? (
                  <motion.div 
                    key="current"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    className="space-y-8 pt-4"
                  >
                    <div className="grid grid-cols-3 gap-4">
                      {(['Z', 'X', 'Y'] as UserId[]).map(id => {
                        const balances = calculateBalances();
                        const balance = balances[id];
                        return (
                          <div 
                            key={`settle-user-${id}`} 
                            className={`text-center space-y-2 cursor-pointer transition-transform active:scale-95 p-2 ${selectedUserDetail === id ? 'scale-110' : ''}`}
                            onClick={() => setSelectedUserDetail(selectedUserDetail === id ? null : id)}
                          >
                            <Avatar id={id} size="md" className={`mx-auto ring-4 ring-offset-2 ${selectedUserDetail === id ? 'ring-emerald-500' : 'ring-transparent'}`} />
                            <p className={`text-sm font-bold font-mono ${balance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {balance >= 0 ? '+' : ''}{balance.toFixed(1)}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <AnimatePresence>
                      {selectedUserDetail && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-gray-50 rounded-2xl p-4 overflow-hidden"
                        >
                          <div className="mb-3">
                            <span className="text-sm font-bold text-gray-900">消费明细 (未平账)</span>
                          </div>
                          <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                            {meals.filter(m => !m.settledAt && m.participants.includes(selectedUserDetail!)).map(m => (
                              <motion.div 
                                key={m.id} 
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                  setShowSettlement(false);
                                  setTimeout(() => {
                                    const el = document.getElementById(`card-${m.id}`);
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }, 100);
                                }}
                                className="flex justify-between items-center p-4 bg-white rounded-2xl shadow-sm border border-gray-100 cursor-pointer transition-all"
                              >
                                <span className="text-gray-900 font-bold flex-1 mr-4">{m.note}</span>
                                <span className="font-mono text-rose-500 font-bold whitespace-nowrap">
                                  -¥{(m.consumptions.reduce((s, c) => s + c.cost, 0) / m.participants.length).toFixed(2)}
                                </span>
                              </motion.div>
                            ))}
                            {meals.filter(m => !m.settledAt && m.participants.includes(selectedUserDetail!)).length === 0 && (
                              <p className="text-center py-2 text-gray-400 text-xs">暂无消费记录</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">平账建议</h4>
                      </div>
                      <div className="space-y-3">
                        {calculateDebts().map((debt, idx) => (
                          <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                            <div className="flex items-center gap-3">
                              <Avatar id={debt.from} size="md" />
                              <span className="text-gray-400">→</span>
                              <Avatar id={debt.to} size="md" />
                            </div>
                            <span className="font-mono font-bold text-lg">¥{debt.amount.toFixed(2)}</span>
                          </div>
                        ))}
                        {calculateDebts().length === 0 && (
                          <p className="text-center py-4 text-gray-400 text-sm">账目已平</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex gap-3">
                        <motion.button 
                          whileTap={{ scale: 0.92 }}
                          onMouseDown={startSettleTimer}
                          onMouseUp={cancelSettleTimer}
                          onMouseLeave={cancelSettleTimer}
                          onTouchStart={startSettleTimer}
                          onTouchEnd={cancelSettleTimer}
                          className="flex-1 relative h-14 bg-gray-900 text-white rounded-2xl font-bold overflow-hidden transition-all"
                        >
                          <div 
                            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-75" 
                            style={{ width: `${settleProgress}%`, opacity: 0.4 }}
                          />
                          <span className="relative z-10">
                            {settleProgress > 0 ? `长按中 ${Math.round(settleProgress)}%` : '长按 2s 平账'}
                          </span>
                        </motion.button>
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { setShowSettlement(false); setSelectedUserDetail(null); }} 
                          className="flex-1 h-14 bg-gray-100 text-gray-600 rounded-2xl font-bold"
                        >
                          取消
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="history"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 20, opacity: 0 }}
                    className="space-y-6"
                  >
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">历史记录</h4>
                    </div>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {settlements.map((s) => (
                        <motion.button
                          key={s.id}
                          whileTap={{ scale: 0.96, x: 5 }}
                          onClick={() => {
                            setSelectedSettlementId(s.id);
                            setShowSettlement(false);
                            setShowHistory(false);
                          }}
                          className="w-full text-left p-4 bg-gray-50 rounded-2xl space-y-3 hover:bg-gray-100 transition-colors group"
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-400">{format(s.date, 'yyyy-MM-dd HH:mm')}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded-full font-bold group-hover:bg-emerald-200">查看详情 →</span>
                          </div>
                          <div className="space-y-2">
                            {s.debts.map((d, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <Avatar id={d.from} size="sm" />
                                  <span className="text-gray-400">→</span>
                                  <Avatar id={d.to} size="sm" />
                                </div>
                                <span className="font-mono font-bold">¥{d.amount.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </motion.button>
                      ))}
                      {settlements.length === 0 && (
                        <p className="text-center py-10 text-gray-400 text-sm italic">暂无历史记录</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Modal>
        )}

        {warning.show && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" 
              onClick={() => setWarning({ show: false, msg: '' })}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative w-full max-w-xs bg-white rounded-[32px] p-8 shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                <TrendingUp className="w-8 h-8 rotate-45" />
              </div>
              <p className="text-gray-600 font-medium leading-relaxed">{warning.msg}</p>
              <button 
                onClick={() => setWarning({ show: false, msg: '' })}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold active:scale-95 transition-transform"
              >
                知道了
              </button>
            </motion.div>
          </div>
        )}

        {/* Toast Notification */}
        <AnimatePresence>
          {toast.show && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-xs"
            >
              <div className="bg-white text-gray-900 px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-3 border border-gray-100 backdrop-blur-xl">
                <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <span className="text-sm font-bold">{toast.msg}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </AnimatePresence>
    </div>
  );
}

function Modal({ title, children, onClose, headerLeft }: { title: string, children: React.ReactNode, onClose: () => void, headerLeft?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ y: '100%' }} 
        animate={{ y: 0 }} 
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            {headerLeft}
            <h2 className="text-xl font-black text-gray-900">{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <CloseIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
