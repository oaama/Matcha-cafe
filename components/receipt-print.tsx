'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { OrderRecord } from '@/lib/types';

type ReceiptPrintProps = {
  order: OrderRecord;
  onClose: () => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function orderTypeLabel(order: OrderRecord) {
  if (order.type === 'DINE_IN') return `داخل الكافيه — طاولة ${order.tableNumber ?? '-'}`;
  if (order.type === 'DELIVERY') return 'توصيل';
  return 'تيك أواي';
}

export default function ReceiptPrint({ order, onClose }: ReceiptPrintProps) {
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [printError, setPrintError] = useState('');

  const printReceipt = () => {
    setPrintError('');
    try {
      window.print();
    } catch {
      setPrintError('تعذر فتح نافذة الطباعة. تحقق من إعدادات المتصفح والطابعة.');
    }
  };

  return (
    <div className="print-shell fixed inset-0 z-[70] flex items-end justify-center bg-[#232122]/50 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title">
      <div className="flex max-h-[95dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-2xl sm:rounded-[1.5rem]">
        <div className="flex items-center justify-between border-b border-[#E5E3B2] p-4">
          <div>
            <p className="text-xs font-semibold text-[#705331]">معاينة قبل الطباعة</p>
            <h2 id="receipt-preview-title" className="text-lg font-bold text-[#232122]">إيصال الطلب {order.orderNumber}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-[#FCF5ED] px-3 py-2 text-xl" aria-label="إغلاق المعاينة">×</button>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-[#E5E3B2] bg-[#FCF5ED] px-4 py-3 text-sm">
          <label className="font-semibold text-[#232122]">
            مقاس الورق
            <select value={paperWidth} onChange={(event) => setPaperWidth(event.target.value as '58mm' | '80mm')} className="ms-2 rounded-lg border-[#E5E3B2] bg-white px-2 py-1">
              <option value="58mm">58mm</option>
              <option value="80mm">80mm</option>
            </select>
          </label>
          <span className="text-[#705331]">الطباعة لا تنشئ طلبًا جديدًا</span>
        </div>
        <div className="overflow-y-auto p-4">
          <article className={`receipt receipt-${paperWidth === '58mm' ? '58' : '80'} mx-auto bg-white text-center text-[#232122]`} dir="rtl">
            <Image src="/matcha-logo.png" alt="Matcha Coffee and Pancakes" width={80} height={80} className="mx-auto h-20 w-20 rounded-full object-cover" />
            <h3 className="mt-2 text-lg font-bold leading-tight">
              <span className="block">MATCHA</span>
              <span className="mt-1 block font-normal text-base">COFFEE AND PANCAKES</span>
            </h3>
            <p className="mt-1 text-xs">01036618656</p>
            <div className="receipt-rule my-3" />
            <div className="space-y-1 text-start text-xs">
              <p><strong>رقم الطلب:</strong> <span dir="ltr">{order.orderNumber}</span></p>
              <p><strong>التاريخ:</strong> {formatDate(order.createdAt)}</p>
              <p><strong>الموظف:</strong> الكاشير</p>
              <p><strong>النوع:</strong> {orderTypeLabel(order)}</p>
              {order.customerName ? <p><strong>الاسم:</strong> {order.customerName}</p> : null}
              {order.customerPhone ? <p><strong>الهاتف:</strong> <span dir="ltr">{order.customerPhone}</span></p> : null}
              {order.type === 'DELIVERY' && order.customerAddress ? <p><strong>العنوان:</strong> {order.customerAddress}</p> : null}
              {order.type === 'DELIVERY' && order.additionalAddressDetails ? <p><strong>تفاصيل:</strong> {order.additionalAddressDetails}</p> : null}
            </div>
            <div className="receipt-rule my-3" />
            <div className="space-y-3 text-start text-xs">
              {order.items.map((item, index) => (
                <div key={`${item.productId}-${index}`}>
                  <div className="flex justify-between gap-2 font-semibold">
                    <span>{item.quantity} × {item.nameAr}</span>
                    <span>{(item.unitPrice * item.quantity).toFixed(2)}</span>
                  </div>
                  {item.selectedOptions.length > 0 ? <p className="mt-1 pe-3 text-[10px] text-[#705331]">{item.selectedOptions.map((option) => option.optionAr).join('، ')}</p> : null}
                  {item.notes ? <p className="mt-1 pe-3 text-[10px] text-[#705331]">{item.notes}</p> : null}
                </div>
              ))}
            </div>
            <div className="receipt-rule my-3" />
            <div className="space-y-1 text-start text-xs">
              <p className="flex justify-between"><span>المجموع</span><span>{order.subtotal.toFixed(2)} ج.م</span></p>
              <p className="flex justify-between"><span>الخدمة</span><span>{order.serviceFee.toFixed(2)} ج.م</span></p>
              <p className="flex justify-between"><span>الضريبة</span><span>{order.tax.toFixed(2)} ج.م</span></p>
              <p className="mt-2 flex justify-between text-sm font-bold"><span>الإجمالي</span><span>{order.total.toFixed(2)} ج.م</span></p>
              <p className="flex justify-between"><span>الدفع</span><span>{order.paymentMethod === 'card' ? 'بطاقة' : 'كاش'}</span></p>
            </div>
            {order.deliveryInstructions ? <p className="mt-3 text-start text-[10px]">تعليمات التوصيل: {order.deliveryInstructions}</p> : null}
            <p className="mt-5 text-xs font-semibold" dir="ltr">Made with love &amp; good vibes</p>
          </article>
        </div>
        {printError ? <p role="alert" className="px-4 pb-2 text-sm text-rose-700">{printError}</p> : null}
        <div className="flex gap-2 border-t border-[#E5E3B2] p-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[#E5E3B2] px-4 py-3 font-semibold text-[#705331]">إلغاء</button>
          <button type="button" onClick={printReceipt} className="flex-1 rounded-xl bg-[#6B8136] px-4 py-3 font-semibold text-white">تأكيد الطباعة</button>
        </div>
      </div>
    </div>
  );
}
