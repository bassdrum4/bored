package
{
   import flash.display.Sprite;
   import flash.utils.getTimer;
   
   public class Tester extends Sprite
   {
      
      private var times:Vector.<Number> = new Vector.<Number>();
      
      private var i:int = 0;
      
      private var oldT:Number;
      
      private var output:int = 0;
      
      private var Times:int;
      
      public function Tester(param1:int = 100)
      {
         super();
         this.times.length = param1;
         this.Times = param1;
         this.times.fixed = true;
      }
      
      public function preShoot() : void
      {
         if(this.i == this.Times)
         {
            return;
         }
         this.oldT = getTimer();
      }
      
      public function shoot() : void
      {
         var _loc1_:int = 0;
         var _loc2_:Number = NaN;
         var _loc3_:Number = NaN;
         var _loc4_:Number = NaN;
         if(this.i == this.Times)
         {
            return;
         }
         this.times[this.i] = getTimer() - this.oldT;
         ++this.i;
         if(this.i == this.Times)
         {
            if(this.output == 0)
            {
               this.output = 1;
               _loc1_ = 0;
               _loc2_ = 0;
               _loc3_ = 0;
               while(_loc1_ < this.Times)
               {
                  _loc2_ += this.times[_loc1_];
                  if(this.times[_loc1_] > _loc3_)
                  {
                     _loc3_ = this.times[_loc1_];
                  }
                  _loc1_++;
               }
               _loc4_ = Math.round(_loc2_ / this.Times * 10) / 10;
               _loc3_ = Math.round(_loc3_ * 10) / 10;
               trace("Times shot: " + this.times.length + " \n| Avg. time: " + _loc4_ + "ms" + " \n| Biggest loadtime: " + _loc3_ + "ms" + "\n| Times: " + this.times);
            }
            return;
         }
      }
   }
}

