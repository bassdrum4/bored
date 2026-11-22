package
{
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.Stage;
   import flash.geom.Point;
   import flash.geom.Rectangle;
   
   public class ScrollEngine
   {
      
      private const rect:Rectangle = new Rectangle();
      
      private const rect2:Rectangle = new Rectangle(0,0,2048,2048);
      
      private const rect3:Rectangle = new Rectangle();
      
      private var stage:Stage;
      
      private var bmd:BitmapData;
      
      private const transitbmd:BitmapData = new BitmapData(2048,2048,true,1048575);
      
      private const pt:Point = new Point();
      
      private const pt2:Point = new Point(300,600);
      
      private var sw:int;
      
      private var sh:int;
      
      private var BM:Bitmap;
      
      public var cc:Boolean = false;
      
      public function ScrollEngine(param1:Stage)
      {
         super();
         this.stage = param1;
         this.rect.width = this.stage.stageWidth;
         this.rect.height = this.stage.stageHeight;
         this.rect3.width = this.stage.stageWidth;
         this.rect3.height = this.stage.stageHeight;
         this.sw = this.stage.stageWidth;
         this.sh = this.stage.stageHeight;
      }
      
      public function Scroll(param1:Bitmap, param2:Number, param3:Number) : void
      {
         this.BM = param1;
         param1.x += param2;
         param1.y += param3;
         this.bmd = param1.bitmapData;
         if(this.cc)
         {
            this.Clear();
            return;
         }
         if(param2 < 0)
         {
            if(param1.x + this.bmd.width - param2 < this.sw)
            {
               this.Clear();
               return;
            }
         }
         if(param3 > 0)
         {
            if(param1.y + this.bmd.height - param3 < 0)
            {
               this.Clear();
               return;
            }
         }
         else if(param3 < 0)
         {
            if(param1.y + this.bmd.height - 100 - param3 < this.sh)
            {
               this.Clear();
               return;
            }
         }
      }
      
      private function Clear() : void
      {
         this.rect.x = -this.BM.x;
         this.rect.y = -this.BM.y;
         this.transitbmd.copyPixels(this.bmd,this.rect,this.pt,null,null,true);
         this.bmd.fillRect(this.rect2,16777215);
         this.bmd.copyPixels(this.transitbmd,this.rect3,this.pt2,null,null,true);
         this.BM.x = -300;
         this.BM.y = -600;
         this.transitbmd.fillRect(this.rect3,16777215);
      }
   }
}

