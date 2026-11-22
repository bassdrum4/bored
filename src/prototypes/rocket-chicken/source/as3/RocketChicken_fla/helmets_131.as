package RocketChicken_fla
{
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol919")]
   public dynamic class helmets_131 extends MovieClip
   {
      
      public var ov:MovieClip;
      
      public var newy:MovieClip;
      
      public function helmets_131()
      {
         super();
         addFrameScript(0,this.frame1);
      }
      
      internal function frame1() : *
      {
         if(!globalVars.newHelmet)
         {
            this.newy.visible = false;
            this.newy.stop();
         }
         else
         {
            this.newy.visible = true;
            this.newy.play();
         }
      }
   }
}

