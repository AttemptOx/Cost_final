import React from 'react';
import { Ingredient, USERS } from '../types';
import { Avatar } from './Avatar';
import { ShoppingCart } from 'lucide-react';
import { format } from 'date-fns';

interface PurchaseCardProps {
  ingredient: Ingredient;
}

export const PurchaseCard: React.FC<PurchaseCardProps> = ({ ingredient }) => {
  return (
    <div className="relative">
      <div className="bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/50">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 bg-vibrant-orange/10 rounded-full flex items-center justify-center">
            <ShoppingCart className="w-3 h-3 text-vibrant-orange" />
          </div>
          <span className="text-[10px] font-black text-vibrant-orange uppercase tracking-widest">入库节点</span>
        </div>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <Avatar id={ingredient.purchaserId} size="md" />
            <div>
              <h3 className="text-lg font-black text-gray-900 leading-tight">{ingredient.name}</h3>
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                {format(ingredient.purchaseDate, 'HH:mm')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-vibrant-orange font-mono">
              ¥{ingredient.totalPrice.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="space-y-2 mt-4 pt-4 border-t border-gray-50">
          <div className="flex justify-between text-[10px] text-gray-400 font-black uppercase tracking-widest">
            <span>当前余量</span>
            <span className="text-gray-900">{ingredient.remainingPercent}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-400 to-teal-500 h-full transition-all duration-500"
              style={{ width: `${ingredient.remainingPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
