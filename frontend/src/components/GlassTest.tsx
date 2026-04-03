import React, { useState } from 'react';

export const GlassTest: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 pointer-events-none">
      <div className="w-full max-w-5xl pointer-events-auto relative">
        <button 
          onClick={() => setIsVisible(false)}
          className="absolute -top-12 right-0 bg-red-500 text-white px-4 py-2 rounded-lg"
        >
          关闭测试面板
        </button>
        
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* 方案1: Tailwind 标准 */}
          <div className="h-40 rounded-2xl flex items-center justify-center text-white font-bold backdrop-blur-md bg-white/20 border border-white/30 shadow-xl">
            1. Tailwind bg-white/20 blur-md
          </div>

          {/* 方案2: 纯 CSS backdrop-filter rgba */}
          <div 
            className="h-40 rounded-2xl flex items-center justify-center text-white font-bold border border-white/20 shadow-xl"
            style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255, 255, 255, 0.1)' }}
          >
            2. inline style rgba/blur(16px)
          </div>

          {/* 方案3: 黑色半透明底色 */}
          <div className="h-40 rounded-2xl flex items-center justify-center text-white font-bold backdrop-blur-xl bg-black/30 border border-white/10 shadow-xl">
            3. Tailwind bg-black/30 blur-xl
          </div>

          {/* 方案4: 使用项目当前自定义变量 */}
          <div 
            className="h-40 rounded-2xl flex items-center justify-center text-white font-bold shadow-xl"
            style={{ 
              backdropFilter: 'blur(var(--glass-blur))', 
              WebkitBackdropFilter: 'blur(var(--glass-blur))',
              backgroundColor: 'hsla(var(--glass-h), var(--glass-s), var(--glass-l), var(--glass-a))'
            }}
          >
            4. 项目的 --glass 变量
          </div>

          {/* 方案5: 伪元素实现 (用于兼容某些浏览器环境) */}
          <div className="h-40 rounded-2xl flex items-center justify-center text-white font-bold border border-white/20 shadow-xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 backdrop-filter backdrop-blur-lg -z-10"></div>
            5. 绝对定位背景层 blur-lg
          </div>

          {/* 方案6: 毛玻璃增加饱和度 saturate */}
          <div className="h-40 rounded-2xl flex items-center justify-center text-white font-bold backdrop-blur-md backdrop-saturate-150 bg-white/10 border border-white/20 shadow-xl">
            6. blur-md + saturate-150
          </div>

        </div>
      </div>
    </div>
  );
};
