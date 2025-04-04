import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MatrixService {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private drops: number[] = [];
  private fontSize: number = 16;
  private columns: number = 0;
  private animationId: number = 0;
  
  // Japanese-like characters (katakana and some kanji)
  private matrixCharacters: string = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ日月火水木金土一二三四五六七八九十百千万円';

  constructor() {}

  public initMatrix(): void {
    console.log('Initializing Matrix Service');
    this.canvas = document.getElementById('matrix-canvas') as HTMLCanvasElement;
    if (!this.canvas) {
        console.error('Matrix canvas not found in DOM');
        return;
    }
    console.log('Canvas found, setting up context');
    
    this.ctx = this.canvas.getContext('2d')!;
    
    // Set canvas dimensions
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    
    // Set up columns
    this.columns = Math.floor(this.canvas.width / this.fontSize);
    
    // Initialize drops array
    this.drops = [];
    for (let i = 0; i < this.columns; i++) {
      this.drops[i] = Math.random() * -100;
    }
    
    // Start animation
    this.animate();
  }
  
  private animate(): void {
    // Semi-transparent black to create trail effect
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Set font and color
    this.ctx.fillStyle = '#0f0';
    this.ctx.font = `${this.fontSize}px monospace`;
    
    // Draw characters
    for (let i = 0; i < this.drops.length; i++) {
      // Random character
      const char = this.matrixCharacters[Math.floor(Math.random() * this.matrixCharacters.length)];
      
      // Draw character
      this.ctx.fillText(char, i * this.fontSize, this.drops[i] * this.fontSize);
      
      // Reset drop when it reaches bottom or randomly
      if (this.drops[i] * this.fontSize > this.canvas.height && Math.random() > 0.975) {
        this.drops[i] = 0;
      }
      
      // Move drop down
      this.drops[i]++;
    }
    
    // Continue animation
    this.animationId = requestAnimationFrame(() => this.animate());
  }
  
  public handleResize(): void {
    if (!this.canvas) return;
    
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    
    // Recalculate columns
    const newColumns = Math.floor(this.canvas.width / this.fontSize);
    
    // Adjust drops array
    if (newColumns > this.drops.length) {
      for (let i = this.drops.length; i < newColumns; i++) {
        this.drops.push(Math.random() * -100);
      }
    } else {
      this.drops.length = newColumns;
    }
  }
  
  public stopMatrix(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}