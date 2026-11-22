package
{
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   
   public class Transitioner extends Sprite
   {
      
      private var bmd:BitmapData;
      
      private var bm:Bitmap;
      
      private var transit:MovieClip;
      
      public function Transitioner(param1:MovieClip)
      {
         super();
         this.transit = param1;
      }
      
      public function transite(param1:* = null) : void
      {
      }
   }
}

