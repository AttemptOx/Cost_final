import React from 'react';
import { Meal, USERS, Ingredient } from '../types';
import { Avatar } from './Avatar';
import { Utensils } from 'lucide-react';
import { format } from 'date-fns';

interface MealCardProps {
  meal: Meal;
  ingredients: Ingredient[];
}

export const MealCard: React.FC<MealCardProps> = ({ meal, ingredients }) => {
  return (
    <div className="relative">
      <div className="bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/50">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 bg-emerald-50 rounded-full flex items-center justify-center">
            <Utensils className="w-3 h-3 text-emerald-600" />
          </div>
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">餐饮节点</span>
        </div>
        {meal.photoUrl && (
          <div className="mb-4 rounded-xl overflow-hidden aspect-video bg-gray-50 border border-gray-100">
            <img
              src={meal.photoUrl}
              alt="Meal"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        <div className="flex justify-between items-start mb-4">
          <div className="space-y-2">
            <div className="flex -space-x-2">
              {meal.participants.map((pid) => (
                <Avatar key={pid} id={pid} size="sm" className="ring-2 ring-white" />
              ))}
            </div>
            <p className="text-xs text-gray-400 font-mono">
              {format(meal.date, 'HH:mm')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black mb-1">Total Cost</p>
            <span className="text-2xl font-black text-gray-900 font-mono">
              ¥{meal.consumptions.reduce((sum, c) => sum + c.cost, 0).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="space-y-2 border-t border-gray-50 pt-4">
          {meal.consumptions.map((c) => {
            const ingredient = ingredients.find((i) => i.id === c.ingredientId);
            return (
              <div key={c.ingredientId} className="flex justify-between items-center text-sm">
                <span className="text-gray-600 font-medium">{ingredient?.name || 'Unknown'}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] px-2 py-0.5 bg-gray-50 rounded-full text-gray-400 font-bold">
                    {c.percentUsed}%
                  </span>
                  <span className="font-mono font-bold text-gray-900">
                    ¥{c.cost.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {meal.note && (
          <p className="mt-4 text-sm text-gray-600 italic border-l-4 border-emerald-500/20 pl-4 py-2 bg-gray-50/50 rounded-r-xl">
            {meal.note}
          </p>
        )}
      </div>
    </div>
  );
};
