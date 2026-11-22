package RocketChicken_fla
{
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol760")]
   public dynamic class kicker_84 extends MovieClip
   {
      
      public var efx:eFX;
      
      public var boot:MovieClip;
      
      public function kicker_84()
      {
         super();
         addFrameScript(0,this.frame1,1,this.frame2);
      }
      
      internal function frame1() : *
      {
         stop();
      }
      
      internal function frame2() : *
      {
         this.efx.gotoAndStop(2);
      }
   }
}

